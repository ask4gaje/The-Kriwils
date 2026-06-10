const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Configuration & .env loader ---
if (fs.existsSync('.env')) {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    });
}

const PORT = 6767;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
};

// --- Helper Functions ---

/**
 * Robustly parses POST body as JSON
 */
function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 5_000_000) reject(new Error('Request body too large'));
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Invalid JSON body'));
            }
        });
    });
}

function sanitize(str) {
    if (!str) return '';
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function getAuthHeader(req) {
    const auth = req.headers['authorization'];
    return (auth && auth.startsWith('Bearer ')) ? auth.slice(7) : null;
}

/**
 * Helper to make HTTPS requests easily
 */
function makeRequest(url, options, body = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                let parsed = null;
                if (data) {
                    try {
                        parsed = JSON.parse(data);
                    } catch (e) {
                        console.error('Failed to parse response JSON:', data.substring(0, 100));
                        parsed = { raw: data };
                    }
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Verifies Supabase JWT and returns the user object
 */
async function verifyUser(jwt) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl) throw new Error('SUPABASE_URL not configured');

    const result = await makeRequest(`${supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${jwt}`,
            'apikey': anonKey || jwt 
        }
    });

    if (result.status !== 200) {
        console.error('JWT Verification Failed:', result.status, result.data);
        throw new Error(`Unauthorized: ${result.status === 401 ? 'Session Expired' : 'Verification Error'}`);
    }
    return result.data;
}

/**
 * Talk to Supabase DB using Service Role (Bypasses RLS)
 */
async function supabaseAdmin(method, path, body = null) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase Admin keys missing');

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    };

    return await makeRequest(`${supabaseUrl}/rest/v1/${path}`, options, body);
}

function generateShortCode() {
    return require('crypto').randomBytes(3).toString('hex').toUpperCase();
}

// --- In-Memory Rate Limiter ---

const rateLimitMap = new Map();
const RATE_WINDOW = 24 * 60 * 60 * 1000;
const RATE_MAX = 100;

function checkRateLimit(userId) {
    const now = Date.now();
    let timestamps = rateLimitMap.get(userId) || [];
    timestamps = timestamps.filter(ts => now - ts < RATE_WINDOW);
    if (timestamps.length >= RATE_MAX) {
        const retryAfter = Math.ceil((timestamps[0] + RATE_WINDOW - now) / 1000);
        return { allowed: false, retryAfter };
    }
    timestamps.push(now);
    rateLimitMap.set(userId, timestamps);
    return { allowed: true };
}

setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of rateLimitMap) {
        const valid = ts.filter(t => now - t < RATE_WINDOW);
        if (valid.length === 0) rateLimitMap.delete(key);
        else rateLimitMap.set(key, valid);
    }
}, 60 * 60 * 1000);

// --- Background Job Logic ---

/**
 * Checks if DeepSeek is responsive before starting a long job.
 */
async function checkAiAvailability(apiKey) {
    const testUrl = 'https://api.deepseek.com/v1/chat/completions';
    try {
        const result = await makeRequest(testUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        }, {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1
        });

        if (result.status !== 200) {
            console.error(`[Pre-check] Ping failed. Status: ${result.status}`, result.data);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`[Pre-check] Connection error during ping:`, e.message);
        return false;
    }
}

async function processBackgroundQuiz(quizId, userId, payload) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const { topic, difficulty, count, pdfContext, title } = payload;

    console.log(`[Background] Starting job for Quiz ID: ${quizId} (User: ${userId})`);

    const models = ['deepseek-chat', 'deepseek-reasoner'];
    let success = false;

    for (const model of models) {
        if (success) break;
        try {
            console.log(`[Background] Attempting with model: ${model}...`);
            
            const sTopic = sanitize(topic);
            let prompt = `Kamu adalah pembuat kuis. Buat kuis berdasarkan topik yang diberikan.
Return STRICTLY a JSON array of ${count} objects.
Semua konten HARUS dalam Bahasa Indonesia.
Difficulty: ${difficulty}.

<user_topic>${sTopic}</user_topic>

Format: [{"question": "...", "options": ["...", "..."], "answer": index, "explanation": "..."}]
Jangan sertakan teks apapun di luar JSON array.`;

            if (pdfContext) {
                const sPdf = sanitize(pdfContext).substring(0, 15000);
                prompt = `Kamu adalah pembuat kuis.
Return STRICTLY a JSON array of ${count} objects.
Semua konten HARUS dalam Bahasa Indonesia.
Difficulty: ${difficulty}.

Materi:\n${sPdf}

Buat kuis berdasarkan materi di atas tentang "${sTopic}".

Format: [{"question": "...", "options": ["...", "..."], "answer": index, "explanation": "..."}]
Jangan sertakan teks apapun di luar JSON array.`;
            }

            const apiUrl = 'https://api.deepseek.com/v1/chat/completions';
            const deepseekResult = await makeRequest(
                apiUrl,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    }
                },
                {
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                }
            );

            if (deepseekResult.status !== 200 || !deepseekResult.data.choices) {
                const errMsg = deepseekResult.data?.error?.message || 'Unknown DeepSeek Error';
                console.error(`[Background] ${model} Failed (${deepseekResult.status}): ${errMsg}`);
                continue; 
            }

            console.log(`[Background] ${model} success. Parsing JSON...`);
            let text = deepseekResult.data.choices[0].message.content;
            const start = text.indexOf('[');
            const end = text.lastIndexOf(']');
            const questions = JSON.parse(text.substring(start, end + 1));

            console.log(`[Background] Updating Database...`);
            const updateResult = await supabaseAdmin('PATCH', `quizzes?id=eq.${quizId}`, {
                questions_json: questions,
                status: 'completed'
            });

            if (updateResult.status >= 400) {
                throw new Error(`DB Patch Error: ${updateResult.status}`);
            }

            success = true;
            console.log(`[Background] Quiz ${quizId} COMPLETED SUCCESSFULLY.`);

        } catch (err) {
            console.error(`[Background] Error with ${model}:`, err.message);
        }
    }

    if (!success) {
        console.error(`[Background] ALL MODELS FAILED for Quiz ${quizId}. Cleaning up...`);
        await supabaseAdmin('DELETE', `quizzes?id=eq.${quizId}`);
    }
}

// --- Main Server ---

const server = http.createServer(async (req, res) => {
    let urlPath = req.url.split('?')[0];

    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // API: Public Config (Hiding keys from frontend code)
    if (urlPath === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY
        }));
    }

    // List available AI models
    if (urlPath === '/api/list-models' && req.method === 'GET') {
        try {
            const jwt = getAuthHeader(req);
            if (!jwt) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Missing Authorization header' })); }
            await verifyUser(jwt);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: ['deepseek-chat', 'deepseek-reasoner'] }));
        } catch (err) {
            const status = err.message.includes('Unauthorized') ? 401 : 500;
            const msg = status === 401 ? err.message : 'An internal error occurred';
            if (status === 500) console.error('[API Error]', err);
            res.writeHead(status);
            return res.end(JSON.stringify({ error: msg }));
        }
        return;
    }

    // API: Enqueue Background Quiz
    if (urlPath === '/api/enqueue-quiz' && req.method === 'POST') {
        try {
            const jwt = getAuthHeader(req);
            if (!jwt) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Missing Authorization header' })); }
            const body = await getBody(req);
            const user = await verifyUser(jwt);
            const userId = user.id;

            const rateCheck = checkRateLimit(userId);
            if (!rateCheck.allowed) {
                res.writeHead(429, { 'Retry-After': String(rateCheck.retryAfter) });
                return res.end(JSON.stringify({
                    error: `Rate limit reached (${RATE_MAX} per day). Try again in ${Math.ceil(rateCheck.retryAfter / 3600)} hour(s).`
                }));
            }

            if (body.topic && body.topic.length > 200) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Topic too long (max 200 characters).' }));
            }
            if (body.title && body.title.length > 200) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Title too long (max 200 characters).' }));
            }

            // NEW: Pre-check AI availability before sending success toast
            console.log('[API] Checking AI Availability before accepting...');
            const isAiUp = await checkAiAvailability(process.env.DEEPSEEK_API_KEY);
            if (!isAiUp) {
                console.error('[API] AI Pre-check failed.');
                res.writeHead(503);
                return res.end(JSON.stringify({ error: 'DeepSeek AI is currently busy or unreachable. Please try again later.' }));
            }

            // Check if user already has a pending quiz
            const pendingCheck = await supabaseAdmin('GET', `quizzes?creator_id=eq.${userId}&status=eq.pending`);
            if (pendingCheck.data && pendingCheck.data.length > 0) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Please wait for your current quiz to finish generating!' }));
            }

            // Insert initial row
            const insertResult = await supabaseAdmin('POST', 'quizzes', {
                creator_id: userId,
                title: body.title,
                topic: body.topic,
                difficulty: body.difficulty,
                questions_json: [], 
                is_replayable: body.isReplayable,
                is_reviewable: body.isReviewable,
                time_limit_seconds: body.timeLimit || null,
                short_code: generateShortCode(),
                status: 'pending'
            });

            if (insertResult.status !== 201) {
                console.error('Database Insert Error:', insertResult.status, insertResult.data);
                throw new Error(`Failed to initialize quiz in DB: ${insertResult.data?.message || 'Unknown Error'}`);
            }

            const quizRecord = insertResult.data[0];

            // Respond immediately
            res.writeHead(202);
            res.end(JSON.stringify({ message: 'Generation started', quizId: quizRecord.id }));

            // Trigger background process
            processBackgroundQuiz(quizRecord.id, userId, body);

        } catch (err) {
            const status = err.message.includes('Unauthorized') ? 401 : 500;
            const msg = status === 401 ? err.message : 'An internal error occurred';
            if (status === 500) console.error('[API Error]', err);
            res.writeHead(status);
            return res.end(JSON.stringify({ error: msg }));
        }
        return;
    }

    // API: Submit Score
    if (urlPath === '/api/submit-score' && req.method === 'POST') {
        try {
            const body = await getBody(req);
            if (!body.quiz_id || !body.player_name || body.score === undefined || !body.total_questions) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Missing required fields' }));
            }
            if (body.score < 0 || body.score > body.total_questions) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Invalid score' }));
            }

            const quizResult = await supabaseAdmin('GET', `quizzes?id=eq.${body.quiz_id}&select=id,is_replayable,questions_json`);
            if (!quizResult.data || quizResult.data.length === 0) {
                res.writeHead(404);
                return res.end(JSON.stringify({ error: 'Quiz not found' }));
            }
            const quiz = quizResult.data[0];
            if (body.total_questions !== quiz.questions_json.length) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Question count mismatch' }));
            }

            if (!quiz.is_replayable) {
                const existing = await supabaseAdmin('GET', `quiz_results?quiz_id=eq.${body.quiz_id}&player_name=eq.${encodeURIComponent(body.player_name)}`);
                if (existing.data && existing.data.length > 0) {
                    res.writeHead(403);
                    return res.end(JSON.stringify({ error: 'You have already played this quiz.' }));
                }
            }

            const existingScore = await supabaseAdmin('GET', `quiz_results?quiz_id=eq.${body.quiz_id}&player_name=eq.${encodeURIComponent(body.player_name)}&select=id,score`);
            if (existingScore.data && existingScore.data.length > 0) {
                const prev = existingScore.data[0];
                if (body.score > prev.score) {
                    await supabaseAdmin('PATCH', `quiz_results?id=eq.${prev.id}`, {
                        score: body.score,
                        created_at: new Date().toISOString()
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ message: 'High score updated!' }));
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: 'Score not higher than previous best.' }));
            }

            await supabaseAdmin('POST', 'quiz_results', {
                quiz_id: body.quiz_id,
                player_name: body.player_name,
                score: body.score,
                total_questions: body.total_questions
            });
            res.writeHead(201, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'Score saved!' }));
        } catch (err) {
            res.writeHead(500);
            return res.end(JSON.stringify({ error: 'An internal error occurred' }));
        }
    }

    // API: Delete Account - removes user data + auth record
    if (urlPath === '/api/delete-account' && req.method === 'DELETE') {
        try {
            const jwt = getAuthHeader(req);
            if (!jwt) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Missing Authorization header' })); }
            const user = await verifyUser(jwt);

            const quizResult = await supabaseAdmin('GET', `quizzes?creator_id=eq.${user.id}&select=id`);
            if (quizResult.data && quizResult.data.length > 0) {
                const quizIds = quizResult.data.map(q => q.id);
                const inClause = quizIds.map(id => `"${id}"`).join(',');
                await supabaseAdmin('DELETE', `quiz_results?quiz_id=in.(${inClause})`);
                await supabaseAdmin('DELETE', `quizzes?creator_id=eq.${user.id}`);
            }

            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            await makeRequest(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${serviceKey}`,
                    'apikey': serviceKey
                }
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'Account deleted' }));
        } catch (err) {
            const status = err.message.includes('Unauthorized') ? 401 : 500;
            const msg = status === 401 ? err.message : 'An internal error occurred';
            if (status === 500) console.error('[API Error]', err);
            res.writeHead(status);
            return res.end(JSON.stringify({ error: msg }));
        }
    }

    // API: Dashboard - List user's quizzes
    if (urlPath === '/api/my-quizzes' && req.method === 'GET') {
        try {
            const jwt = getAuthHeader(req);
            if (!jwt) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Missing Authorization header' })); }
            const user = await verifyUser(jwt);
            const result = await supabaseAdmin('GET', `quizzes?creator_id=eq.${user.id}&order=created_at.desc`);
            if (result.status >= 400) throw new Error(result.data?.message || 'DB Error');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ quizzes: result.data || [] }));
        } catch (err) {
            const status = err.message.includes('Unauthorized') ? 401 : 500;
            const msg = status === 401 ? err.message : 'An internal error occurred';
            if (status === 500) console.error('[API Error]', err);
            res.writeHead(status);
            return res.end(JSON.stringify({ error: msg }));
        }
    }

    // API: User Stats
    if (urlPath === '/api/user-stats' && req.method === 'GET') {
        try {
            const jwt = getAuthHeader(req);
            if (!jwt) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Missing Authorization header' })); }
            const user = await verifyUser(jwt);

            const quizzesResult = await supabaseAdmin('GET', `quizzes?creator_id=eq.${user.id}&select=id`);
            const quizzes = quizzesResult.data || [];
            const quizzes_count = quizzes.length;

            let total_plays = 0;
            if (quizzes.length > 0) {
                const quizIds = quizzes.map(q => q.id);
                const inClause = quizIds.map(id => `"${id}"`).join(',');
                const resultsResult = await supabaseAdmin('GET', `quiz_results?quiz_id=in.(${inClause})&select=id`);
                total_plays = (resultsResult.data || []).length;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ quizzes_count, total_plays }));
        } catch (err) {
            const status = err.message.includes('Unauthorized') ? 401 : 500;
            const msg = status === 401 ? err.message : 'An internal error occurred';
            if (status === 500) console.error('[API Error]', err);
            res.writeHead(status);
            return res.end(JSON.stringify({ error: msg }));
        }
    }

    // API: Single Quiz CRUD
    if (urlPath.startsWith('/api/quiz/') && urlPath.split('/').length === 4) {
        const quizId = urlPath.split('/api/quiz/')[1];
        try {
            const jwt = getAuthHeader(req);
            if (!jwt) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Missing Authorization header' })); }
            const user = await verifyUser(jwt);

            const fetchResult = await supabaseAdmin('GET', `quizzes?id=eq.${quizId}`);
            if (!fetchResult.data || fetchResult.data.length === 0) {
                res.writeHead(404);
                return res.end(JSON.stringify({ error: 'Quiz not found' }));
            }
            const quiz = fetchResult.data[0];
            if (quiz.creator_id !== user.id) {
                res.writeHead(403);
                return res.end(JSON.stringify({ error: 'You do not own this quiz' }));
            }

            if (req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ quiz }));
            }

            if (req.method === 'PATCH') {
                const body = await getBody(req);
                const allowed = {};
                if (body.title !== undefined) allowed.title = body.title;
                if (body.is_replayable !== undefined) allowed.is_replayable = body.is_replayable;
                if (body.is_reviewable !== undefined) allowed.is_reviewable = body.is_reviewable;
                if (body.time_limit_seconds !== undefined) allowed.time_limit_seconds = body.time_limit_seconds;
                if (body.questions_json !== undefined) allowed.questions_json = body.questions_json;
                const updateResult = await supabaseAdmin('PATCH', `quizzes?id=eq.${quizId}`, allowed);
                if (updateResult.status >= 400) throw new Error(updateResult.data?.message || 'Update failed');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ quiz: updateResult.data?.[0] || quiz }));
            }

            if (req.method === 'DELETE') {
                await supabaseAdmin('DELETE', `quiz_results?quiz_id=eq.${quizId}`);
                await supabaseAdmin('DELETE', `quizzes?id=eq.${quizId}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: 'Quiz deleted' }));
            }

            res.writeHead(405);
            return res.end(JSON.stringify({ error: 'Method not allowed' }));
        } catch (err) {
            const status = err.message.includes('Unauthorized') ? 401 : 500;
            const msg = status === 401 ? err.message : 'An internal error occurred';
            if (status === 500) console.error('[API Error]', err);
            res.writeHead(status);
            return res.end(JSON.stringify({ error: msg }));
        }
    }

    // Pretty URL rewriting
    if (urlPath.startsWith('/play/')) {
        urlPath = '/play.html';
    }

    let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'join.html' : urlPath);
    let extname = path.extname(filePath);

    // Extension-less paths → try appending .html
    if (!extname) {
        const htmlFilePath = filePath + '.html';
        try {
            fs.accessSync(htmlFilePath, fs.constants.R_OK);
            filePath = htmlFilePath;
            extname = '.html';
        } catch (_) {}
    }

    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            res.end(err.code === 'ENOENT' ? 'File not found' : `Server Error: ${err.code}`);
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});
server.timeout = 30000;
server.listen(PORT, () => {
    console.log(`\nServer running at http://localhost:${PORT}/`);
    
    // Startup Health Check
    console.log('--- Environment Check ---');
    const required = ['DEEPSEEK_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
    let allOk = true;
    required.forEach(key => {
        if (!process.env[key]) {
            console.error(`MISSING: ${key}`);
            allOk = false;
        } else {
            console.log(`LOADED: ${key}`);
        }
    });
    if (allOk) console.log('All systems ready!');
    else console.warn('Warning: Some features will not work without the keys above.');
    console.log('-------------------------\n');
});

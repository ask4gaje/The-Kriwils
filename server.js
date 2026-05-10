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

// In-memory state for rate limiting
const cooldowns = {}; // { userId: timestamp }
const COOLDOWN_MS = 30000; // 30 seconds

// --- Helper Functions ---

/**
 * Robustly parses POST body as JSON
 */
function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Invalid JSON body'));
            }
        });
    });
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
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- Background Job Logic ---

/**
 * Checks if Gemini is responsive before starting a long job.
 */
async function checkAiAvailability(apiKey) {
    const model = 'gemini-2.5-flash';
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
        const result = await makeRequest(testUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
            contents: [{ parts: [{ text: "hi" }] }],
            generationConfig: { maxOutputTokens: 1 }
        });
        
        if (result.status !== 200) {
            console.error(`[Pre-check] Ping failed for ${model}. Status: ${result.status}`, result.data);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`[Pre-check] Connection error during ping:`, e.message);
        return false;
    }
}

async function processBackgroundQuiz(quizId, userId, payload) {
    const apiKey = process.env.GEMINI_API_KEY;
    const { topic, difficulty, count, pdfContext, title } = payload;

    console.log(`[Background] Starting job for Quiz ID: ${quizId} (User: ${userId})`);

    // Updated to match the specific 2.5/flash-latest models available to this API key
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
    let success = false;

    for (const model of models) {
        if (success) break;
        try {
            console.log(`[Background] Attempting with model: ${model}...`);
            
            // 1. Prepare Prompt
            let prompt = `Generate a quiz about "${topic}" with ${difficulty} difficulty. 
            Return strictly a JSON array of ${count} objects. 
            All content MUST be in Indonesian.
            Format: [{"question": "...", "options": ["...", "..."], "answer": index, "explanation": "..."}]`;

            if (pdfContext) {
                prompt = `Materi: ${pdfContext.substring(0, 15000)}\n\nBuat kuis ${count} soal tentang "${topic || 'materi tersebut'}" (${difficulty}) dalam format JSON array Bahasa Indonesia.`;
            }

            // 2. Call Gemini
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const geminiResult = await makeRequest(
                apiUrl,
                { method: 'POST', headers: { 'Content-Type': 'application/json' } },
                { contents: [{ parts: [{ text: prompt }] }] }
            );

            if (geminiResult.status !== 200 || !geminiResult.data.candidates) {
                const errMsg = geminiResult.data?.error?.message || 'Unknown Gemini Error';
                console.error(`[Background] ${model} Failed (${geminiResult.status}): ${errMsg}`);
                continue; 
            }

            console.log(`[Background] ${model} success. Parsing JSON...`);
            let text = geminiResult.data.candidates[0].content.parts[0].text;
            const start = text.indexOf('[');
            const end = text.lastIndexOf(']');
            const questions = JSON.parse(text.substring(start, end + 1));

            // 3. Update DB to Completed
            console.log(`[Background] Updating Database...`);
            const updateResult = await supabaseAdmin('PATCH', `quizzes?id=eq.${quizId}`, {
                questions_json: questions,
                status: 'completed'
            });

            if (updateResult.status >= 400) {
                throw new Error(`DB Patch Error: ${updateResult.status}`);
            }

            success = true;
            cooldowns[userId] = Date.now();
            console.log(`✨ [Background] Quiz ${quizId} COMPLETED SUCCESSFULLY.`);

        } catch (err) {
            console.error(`[Background] Error with ${model}:`, err.message);
        }
    }

    if (!success) {
        console.error(`❌ [Background] ALL MODELS FAILED for Quiz ${quizId}. Cleaning up...`);
        await supabaseAdmin('DELETE', `quizzes?id=eq.${quizId}`);
    }
}

// --- Main Server ---

http.createServer(async (req, res) => {
    let urlPath = req.url.split('?')[0];

    // API: Public Config (Hiding keys from frontend code)
    if (urlPath === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY
        }));
    }

    // DEBUG: List Gemini Models
    if (urlPath === '/api/list-models' && req.method === 'GET') {
        const apiKey = process.env.GEMINI_API_KEY;
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        
        https.get(testUrl, (apiRes) => {
            let data = '';
            apiRes.on('data', d => data += d);
            apiRes.on('end', () => {
                res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(data);
            });
        }).on('error', (e) => {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
        });
        return;
    }

    // API: Enqueue Background Quiz
    if (urlPath === '/api/enqueue-quiz' && req.method === 'POST') {
        try {
            const body = await getBody(req);
            const user = await verifyUser(body.jwt);
            const userId = user.id;

            // NEW: Pre-check AI availability before sending success toast
            console.log('[API] Checking AI Availability before accepting...');
            const isAiUp = await checkAiAvailability(process.env.GEMINI_API_KEY);
            if (!isAiUp) {
                console.error('[API] AI Pre-check failed.');
                res.writeHead(503);
                return res.end(JSON.stringify({ error: 'Gemini AI is currently busy or unreachable. Please try again later.' }));
            }

            // Check if user already has a pending quiz
            const pendingCheck = await supabaseAdmin('GET', `quizzes?creator_id=eq.${userId}&status=eq.pending`);
            if (pendingCheck.data && pendingCheck.data.length > 0) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Please wait for your current quiz to finish generating!' }));
            }

            // Check Cooldown (only after success)
            const lastSuccess = cooldowns[userId] || 0;
            const timePassed = Date.now() - lastSuccess;
            if (timePassed < COOLDOWN_MS) {
                res.writeHead(429);
                return res.end(JSON.stringify({ error: `Slow down! Please wait ${Math.ceil((COOLDOWN_MS - timePassed) / 1000)}s.` }));
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
            res.writeHead(err.message.includes('Unauthorized') ? 401 : 500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Proxy API (Legacy)
    if (urlPath === '/api/generate-quiz' && req.method === 'POST') {
        res.writeHead(410); 
        return res.end(JSON.stringify({ error: 'Your browser is running an old version of the app. Please refresh the page (Ctrl+F5).' }));
    }

    // Pretty URL handling
    if (urlPath.startsWith('/play/')) {
        urlPath = '/play.html';
    }

    let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'join.html' : urlPath);
    const extname = path.extname(filePath);
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
}).listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}/`);
    
    // Startup Health Check
    console.log('--- Environment Check ---');
    const required = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
    let allOk = true;
    required.forEach(key => {
        if (!process.env[key]) {
            console.error(`❌ MISSING: ${key}`);
            allOk = false;
        } else {
            console.log(`✅ LOADED: ${key}`);
        }
    });
    if (allOk) console.log('✨ All systems ready!');
    else console.warn('⚠️ Warning: Some features will not work without the keys above.');
    console.log('-------------------------\n');
});

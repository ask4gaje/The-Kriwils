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
            res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
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
    if (!supabaseUrl) throw new Error('SUPABASE_URL not configured');

    const result = await makeRequest(`${supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${jwt}`,
            'apikey': process.env.SUPABASE_ANON_KEY || jwt // PostgREST requires apikey
        }
    });

    if (result.status !== 200) throw new Error('Unauthorized or Session Expired');
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

async function processBackgroundQuiz(quizId, userId, payload) {
    const apiKey = process.env.GEMINI_API_KEY;
    const { topic, difficulty, count, pdfContext, title } = payload;

    try {
        // 1. Prepare Prompt
        let prompt = `Generate a quiz about "${topic}" with ${difficulty} difficulty. 
        Return strictly a JSON array of ${count} objects. 
        All content MUST be in Indonesian.
        Format: [{"question": "...", "options": ["...", "..."], "answer": index, "explanation": "..."}]`;

        if (pdfContext) {
            prompt = `Materi: ${pdfContext.substring(0, 15000)}\n\nBuat kuis ${count} soal tentang "${topic || 'materi tersebut'}" (${difficulty}) dalam format JSON array Bahasa Indonesia.`;
        }

        // 2. Call Gemini
        const geminiResult = await makeRequest(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' } },
            { contents: [{ parts: [{ text: prompt }] }] }
        );

        if (geminiResult.status !== 200 || !geminiResult.data.candidates) {
            throw new Error('Gemini API Error');
        }

        let text = geminiResult.data.candidates[0].content.parts[0].text;
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        const questions = JSON.parse(text.substring(start, end + 1));

        // 3. Update DB to Completed
        await supabaseAdmin('PATCH', `quizzes?id=eq.${quizId}`, {
            questions_json: questions,
            status: 'completed'
        });

        // 4. Start Cooldown only after SUCCESS
        cooldowns[userId] = Date.now();
        console.log(`Quiz ${quizId} completed successfully for user ${userId}`);

    } catch (err) {
        console.error(`Background Job Failed for ${quizId}:`, err.message);
        // 5. Delete on failure
        await supabaseAdmin('DELETE', `quizzes?id=eq.${quizId}`);
        console.log(`Cleaned up failed quiz ${quizId}`);
    }
}

// --- Main Server ---

http.createServer(async (req, res) => {
    let urlPath = req.url.split('?')[0];

    // API: Enqueue Background Quiz
    if (urlPath === '/api/enqueue-quiz' && req.method === 'POST') {
        try {
            const body = await getBody(req);
            const user = await verifyUser(body.jwt);
            const userId = user.id;

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
                is_replayable: body.isReplayable,
                is_reviewable: body.isReviewable,
                short_code: generateShortCode(),
                status: 'pending'
            });

            if (insertResult.status !== 201) throw new Error('Failed to initialize quiz in DB');

            const quizRecord = insertResult.data[0];

            // Respond immediately
            res.writeHead(202);
            res.end(JSON.stringify({ message: 'Generation started', quizId: quizRecord.id }));

            // Trigger background process (Don't await it!)
            processBackgroundQuiz(quizRecord.id, userId, body);

        } catch (err) {
            res.writeHead(err.message.includes('Unauthorized') ? 401 : 500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Proxy API (Legacy, kept for compatibility if needed)
    if (urlPath === '/api/generate-quiz' && req.method === 'POST') {
        // ... (can eventually remove this once script.js is updated)
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
    console.log(`Server running at http://localhost:${PORT}/`);
});

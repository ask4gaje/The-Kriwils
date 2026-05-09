const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Simple .env loader
if (fs.existsSync('.env')) {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
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

http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    
    // 1. Proxy API Requests (Hidden Key Logic)
    if (urlPath === '/api/generate-quiz' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const { prompt, model } = JSON.parse(body);
            const apiKey = process.env.GEMINI_API_KEY;

            if (!apiKey) {
                res.writeHead(500);
                return res.end(JSON.stringify({ error: 'API Key not configured on server.' }));
            }

            const apiReq = https.request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, (apiRes) => {
                let apiData = '';
                apiRes.on('data', d => apiData += d);
                apiRes.on('end', () => {
                    res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(apiData);
                });
            });

            apiReq.on('error', (e) => {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            });

            apiReq.write(JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }));
            apiReq.end();
        });
        return;
    }

    // 2. Pretty URL handling for Quiz Player
    if (urlPath.startsWith('/play/')) {
        urlPath = '/play.html';
    }

    let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'login.html' : urlPath);
    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Serving files from: ${PUBLIC_DIR}`);
});

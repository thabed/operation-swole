const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '127.0.0.1';
const API_KEY = process.env.ANTHROPIC_API_KEY;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      sendJson(res, 500, { error: 'Failed to read file' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function getStaticFilePath(urlPath) {
  const rawPath = urlPath === '/' ? '/index.html' : urlPath;
  const decodedPath = decodeURIComponent(rawPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^([.][.][/\\])+/, '');
  return path.join(ROOT, normalizedPath);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleCoachRequest(req, res) {
  if (!API_KEY) {
    sendJson(res, 503, {
      error: 'AI coach is not configured.',
      detail: 'Set the ANTHROPIC_API_KEY environment variable before starting server.js.',
    });
    return;
  }

  let payload;
  try {
    const body = await readRequestBody(req);
    payload = JSON.parse(body || '{}');
  } catch (error) {
    sendJson(res, 400, { error: 'Invalid JSON request body.' });
    return;
  }

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const text = await anthropicResponse.text();
    res.writeHead(anthropicResponse.status, {
      'Content-Type': anthropicResponse.headers.get('content-type') || 'application/json; charset=utf-8',
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 502, {
      error: 'Failed to reach Anthropic API.',
      detail: error.message,
    });
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && requestUrl.pathname === '/api/coach') {
    await handleCoachRequest(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const filePath = getStaticFilePath(requestUrl.pathname);
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Operation Swole running at http://${HOST}:${PORT}`);
});
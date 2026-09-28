// frontend/server.js
const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(
    {
      key: fs.readFileSync(process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', '100.118.151.3+3-key.pem')),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', '100.118.151.3+3.pem')),
    },
    (req, res) => {
      // 🔥 Force the real client IP into the header – trust the socket, not the client
      const clientIP = req.socket.remoteAddress?.replace(/^::ffff:/, '') || '127.0.0.1';
      req.headers['x-forwarded-for'] = clientIP;

      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    }
  ).listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on https://100.118.151.3:3000');
  });
});
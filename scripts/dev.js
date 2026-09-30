// Local preview without the Vercel CLI: serves the static files and the /api functions.
//   node scripts/dev.js   ->   http://localhost:3000/cockpit/
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const api = pathname.match(/^\/api\/([a-z]+)$/);
  if (api) {
    const file = path.join(root, 'api', `${api[1]}.js`);
    if (fs.existsSync(file)) return require(file)(req, res);
  }
  let file = path.join(root, path.normalize(pathname));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}/cockpit/`));

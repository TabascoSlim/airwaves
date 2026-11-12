// Local development server: serves the site and the /api functions the same way Vercel does.
// Run with:  node dev-server.js   then open http://localhost:8080
// (Needs Node 18 or newer. No packages to install.)

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');

    if (pathname.startsWith('/api/')) {
        const name = pathname.slice('/api/'.length).replace(/[^a-z0-9-]/gi, '');
        const file = path.join(ROOT, 'api', `${name}.js`);
        if (!name || !fs.existsSync(file)) {
            res.statusCode = 404;
            return res.end('Not found');
        }
        return require(file)(req, res);
    }

    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(ROOT, relative));
    if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}.`)) {
        res.statusCode = 403;
        return res.end('Forbidden');
    }
    fs.readFile(file, (error, data) => {
        if (error) {
            res.statusCode = 404;
            return res.end('Not found');
        }
        res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
        res.end(data);
    });
});

server.listen(PORT, () => console.log(`Airwaves running at http://localhost:${PORT}`));

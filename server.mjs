import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.');
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.pdf':'application/pdf'};
http.createServer(async (req,res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url,'http://localhost').pathname));
    if (!path.startsWith(root + sep) || path.includes(sep+'.git'+sep)) {res.writeHead(403).end();return;}
    const data = await readFile(path);
    res.writeHead(200, {'Content-Type':mime[extname(path)] || 'application/octet-stream','Cache-Control':'no-cache'}).end(data);
  } catch {res.writeHead(404).end('Not found');}
}).listen(8080,'127.0.0.1',()=>console.log('PDF editor: http://127.0.0.1:8080'));

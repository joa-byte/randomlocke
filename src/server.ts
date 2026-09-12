import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PokeClient, ApiError } from './pokemon/client.ts';
import { analyze } from './routes/api.ts';

async function body(req: IncomingMessage) {
  let text = ''; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw new ApiError('Solicitud demasiado grande.', 413);
    text += chunk;
  }
  try { return JSON.parse(text); } catch { throw new ApiError('JSON inválido.', 400); }
}
function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
export function makeServer(client = new PokeClient()) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://raw.githubusercontent.com https://raw.github.com data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, {ok:true});
      if (req.method === 'POST' && url.pathname === '/api/analyze') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError('Se requiere JSON.', 415);
        return json(res, await analyze(client, await body(req)));
      }
      const match = url.pathname.match(/^\/api\/(catalog|pokemon|move)\/([a-z0-9-]+)$/);
      if (req.method === 'GET' && match) {
        const [,kind,id] = match;
        return json(res, kind === 'catalog' ? await client.catalog(id) : kind === 'pokemon' ? await client.pokemon(id) : await client.move(id));
      }
      const assets: Record<string,[string,string]> = {'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file,type] = assets[url.pathname];
        const content = await readFile(new URL(`../public/${file}`, import.meta.url));
        res.writeHead(200, {'Content-Type':`${type}; charset=utf-8`}); return res.end(content);
      }
      json(res, {error:'Ruta no encontrada.'}, 404);
    } catch (error) {
      const known = error instanceof ApiError;
      if (!known) console.error(error);
      json(res, {error: known ? error.message : 'Error interno. Reintentá.'}, known ? error.status : 500);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  makeServer().listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`Randomlocke: http://localhost:${port}`));
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const carpetaWeb = fileURLToPath(new URL('../../../dist/', import.meta.url));
const tipos: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
// Sirve únicamente los archivos compilados; nunca .env ni fuentes del backend.
export async function servirWeb(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405);
            res.end();
            return;
        }
        const ruta = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
        const archivo = resolve(carpetaWeb, ruta === '/' ? 'index.html' : '.' + ruta);
        if (!archivo.startsWith(resolve(carpetaWeb) + sep) || !tipos[extname(archivo)]) {
            res.writeHead(404);
            res.end('Página no encontrada.');
            return;
        }
        const contenido = await readFile(archivo);
        res.writeHead(200, { 'Content-Type': tipos[extname(archivo)]!, 'Cache-Control': extname(archivo) === '.html' ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
        res.end(req.method === 'HEAD' ? undefined : contenido);
    }
    catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Página no encontrada. Compilá el frontend con npm run build.');
    }
}

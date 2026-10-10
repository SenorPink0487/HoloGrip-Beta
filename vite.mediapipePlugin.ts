import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function mediapipePlugin(): Plugin {
  const publicDir = path.resolve(__dirname, 'public');

  const handler = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const rawUrl = req.url ?? '';
    const cleanUrl = rawUrl.split('?')[0];

    if (cleanUrl.startsWith('/mediapipe/') || cleanUrl.startsWith('/models/')) {
      const isMediaPipe = cleanUrl.startsWith('/mediapipe/');
      const baseDir = isMediaPipe ? 'mediapipe' : 'models';
      const relPath = cleanUrl.replace(isMediaPipe ? /^\/mediapipe\// : /^\/models\//, '');
      if (relPath.includes('..') || relPath.includes('\\')) {
        next();
        return;
      }

      const filePath = path.resolve(publicDir, baseDir, relPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        if (cleanUrl.endsWith('.js') || cleanUrl.endsWith('.mjs')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (cleanUrl.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
        } else if (cleanUrl.endsWith('.task') || cleanUrl.endsWith('.tflite')) {
          res.setHeader('Content-Type', 'application/octet-stream');
        }

        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
        res.setHeader('Cache-Control', 'no-cache');

        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    next();
  };

  return {
    name: 'mediapipe-assets',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
    resolveId(id) {
      const [cleanId] = id.split('?');
      if (cleanId.startsWith('/mediapipe/')) {
        return cleanId;
      }
    },
    load(id) {
      const [cleanId] = id.split('?');
      if (cleanId.startsWith('/mediapipe/')) {
        const relPath = cleanId.replace(/^\/mediapipe\//, '');
        if (!relPath.includes('..') && !relPath.includes('\\')) {
          const filePath = path.resolve(publicDir, 'mediapipe', relPath);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            if (cleanId.endsWith('.js') || cleanId.endsWith('.mjs')) {
              return fs.readFileSync(filePath, 'utf-8');
            }
          }
        }
      }
    },
  };
}

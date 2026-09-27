import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  buildMixtureRequest,
  extractMixtureJson,
  normalizeMixtureQuery,
  parseAnalyzedMixture,
} from './src/chemistry/mixtureAnalysis.ts';

function publicError(message: string): string {
  const clean = message.replace(/sk-[A-Za-z0-9]+/g, '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 120) || '成分分析失败';
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join('');
}

export async function analyzeMixtureWithDeepSeek(apiKey: string, query: string, timeoutMs = 4000): Promise<unknown> {
  if (!apiKey) throw new Error('成分分析还没有配置密钥');
  const text = normalizeMixtureQuery(query);
  if (!text) throw new Error('请说出要分析的东西');

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildMixtureRequest(text)),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json() as { error?: { message?: string } };
      detail = payload.error?.message ?? '';
    } catch {
      detail = '';
    }
    throw new Error(detail ? publicError(detail) : '成分分析暂时没有回应');
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = messageText(payload.choices?.[0]?.message?.content);
  if (!content.trim()) throw new Error('没有拆出可用的成分');
  return extractMixtureJson(content);
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求太大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function mixturePlugin(apiKey: string): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const url = req.url?.split('?')[0];
    if (url !== '/api/chem/analyze') {
      next();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: '请用文字描述要分析的东西' });
      return;
    }
    try {
      const raw = await readBody(req, 8_000);
      const body = JSON.parse(raw) as { query?: unknown };
      if (typeof body.query !== 'string') throw new Error('请说出要分析的东西');
      const mixture = parseAnalyzedMixture(await analyzeMixtureWithDeepSeek(apiKey, body.query));
      sendJson(res, 200, { mixture });
    } catch (error) {
      const message = error instanceof Error ? publicError(error.message) : '成分分析失败';
      const aborted = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      sendJson(res, aborted ? 504 : 502, { error: aborted ? '分析超时，请再说一次' : message });
    }
  };

  return {
    name: 'chem-mixture',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

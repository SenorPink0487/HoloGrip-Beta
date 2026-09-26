import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { extractJsonObject } from './src/scene/math/extractJson.ts';

const RECOGNIZE_SYSTEM_PROMPT = `你是高中立体几何识图器。用户上传的图几乎都是斜二测画法：水平向右是真实的 x，竖直向上是真实的 y，斜向约 45° 且画出来更短的那条轴是深度 z，纸上的斜线长度不是真实长度。不要把像素坐标抄下来。

根据图中的字母、实线、虚线和题目里的长度、垂直、中点、比例，还原真实的三维模型。坐标系用右手系，y 轴向上，底面在 y=0。方便的顶点放在原点附近。数字用题目里的长度，根号写成小数，保留 4 位。没给的长度用垂直和全等推出来，仍不知道就用 1。

规则：
- AD⊥平面ABC 时，D 和 A 的 x、z 相同，只有高度 y 不同。
- 直角在 C、CA 与 CB 垂直时，C 放在原点，CA 沿 x 轴，CB 沿 z 轴。
- 虚线是被挡住的棱，仍然写进 edges。
- 图里多画出来的线段，例如中点连线 BM、PQ，全部放进 aux。已经重合在某条棱上的线段不要再放。没有额外线就给空数组。
- 分点：DQ=3QC 且 Q 在 DC 上，表示从 D 到 C 的 t=0.75。中点 t=0.5。辅助点可以引用另一个辅助点。
- 不在棱上的点直接给 x,y,z。
- 圆柱、圆锥的底面用 8 个点近似圆。

只输出一个 JSON 对象，不要 Markdown，不要解答。字段：
name, subtitle,
vertices:[{id,x,y,z}],
edges:[[id,id]],
faces:[[id,id,id]],
points:[{id,from,to,t}] 或 {id,x,y,z},
aux:[[id,id]]`;

const RECOGNIZE_USER_PROMPT = '按斜二测画法还原图中的立体，只输出 JSON。';

function publicError(message: string): string {
  const clean = message.replace(/sk-[A-Za-z0-9]+/g, '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 120) || '识图失败';
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

export function buildRecognizeRequest(imageDataUrl: string) {
  return {
    model: 'deepseek-flash',
    thinking: { type: 'disabled' },
    max_tokens: 1400,
    stream: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: RECOGNIZE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: RECOGNIZE_USER_PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
  };
}

export async function recognizeWithDeepSeek(apiKey: string, imageDataUrl: string, timeoutMs = 10000): Promise<unknown> {
  if (!apiKey) throw new Error('识图服务还没有配置密钥');
  if (!imageDataUrl.startsWith('data:image/')) throw new Error('请上传图片');

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildRecognizeRequest(imageDataUrl)),
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
    throw new Error(detail ? publicError(detail) : '识图服务暂时没有回应');
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const text = messageText(payload.choices?.[0]?.message?.content);
  if (!text.trim()) throw new Error('没有认出图里的立体');
  return extractJsonObject(text);
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('图片太大'));
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

export function recognizePlugin(apiKey: string): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const url = req.url?.split('?')[0];
    if (url !== '/api/math/recognize') {
      next();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: '请用图片请求识图' });
      return;
    }
    try {
      const raw = await readBody(req, 8_000_000);
      const body = JSON.parse(raw) as { image?: unknown };
      if (typeof body.image !== 'string') throw new Error('没有收到图片');
      const figure = await recognizeWithDeepSeek(apiKey, body.image);
      sendJson(res, 200, { figure });
    } catch (error) {
      const message = error instanceof Error ? publicError(error.message) : '识图失败';
      const aborted = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      sendJson(res, aborted ? 504 : 502, { error: aborted ? '识别超时，请再试一次' : message });
    }
  };

  return {
    name: 'math-recognize',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

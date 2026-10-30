import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { extractJsonObject } from './src/scene/math/extractJson.ts';

export const FAST_STEREOMETRY_SYSTEM_PROMPT = `你是高中立体几何极速识图与空间约束提取器。
先把照片按汉字正常水平阅读方向扶正观察（记录顺时针旋转角 rot: 0|90|180|270），按右手系（+X水平向右，+Y竖直向上为高度轴，底面在y=0；+Z朝观察者向前，底面后排边z=0，前排顶点z>0）只输出一个紧凑JSON（不要Markdown）：
{
  "rot": 0,
  "text": "如图，在四棱锥W-UVXY中，WV⊥平面UVXY，UX∥VY，UV=VY=WV=2，H为棱WU上的动点",
  "name": "四棱锥 W-UVXY",
  "subtitle": "WV⊥平面UVXY，UX∥VY",
  "faces": [["U","V","X","Y"],["W","U","V"],["W","V","X"],["W","X","Y"],["W","Y","U"]],
  "points": [{"id":"H","from":"U","to":"W","t":0.4,"conn":["V"]}],
  "aux": [["U","X","dashed"]],
  "constraints": {
    "base": ["U","V","X","Y"],
    "up": [["V","W"]],
    "len": [["U","V",2],["V","Y",2],["W","V",2]],
    "eq": [],
    "par": [["U","X","V","Y"]],
    "perp": [["W","V","U","V"],["W","V","V","Y"]],
    "ang": [],
    "lr": [["Y","V"]],
    "front": ["U","X"],
    "back": ["Y","V"]
  },
  "vertices": [["U",-1,0,1],["V",1,0,0],["X",1,0,1],["Y",-1,0,0],["W",1,2,0]]
}
严格遵守：
1. text：逐字抄录题干关键条件（保留全部 ⊥、∥、△、角度、边长等式、动点/分点；无文字填空字符串）。
2. faces：列出多面体全部外表面周界环绕顶点（平整四边形面勿拆成两个三角形；圆柱/圆锥底面用8顶点近似圆）。
3. points：列出不在多面体顶点上的棱上动点/中点/分点（估算 t∈(0,1)）；conn 填入图中以该点为端点直接引出的额外实线或虚线所连向的目标字母（极短连线切勿漏掉；仅从背后穿过的顶点长对角线交点不是该点连线；无则填 []）。
4. aux：只填多面体顶点之间图中真实画有墨迹线条的对角线 [端点1, 端点2, "solid"或"dashed"]（未画墨迹线的两点严禁填入）。
5. constraints：base(底面y=0环序)、up(垂直底面向上的有向边[下,上])、len(仅填题干明确给数值的边长)、eq([1,2,3,4,倍数k]表示|12|=k*|34|)、par([1,2,3,4]平行)、perp([1,2,3,4]垂直)、ang([1,2,3,度数])、lr/front/back。
6. vertices：用 [点名,x,y,z] 给多面体本体顶点初值（底面y=0，高度沿+Y）。`;

export const FAST_STEREOMETRY_USER_PROMPT = '识别图中立体几何题并输出紧凑约束与拓扑JSON。';

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
    temperature: 0,
    thinking: { type: 'disabled' },
    max_tokens: 900,
    stream: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: FAST_STEREOMETRY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: FAST_STEREOMETRY_USER_PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
  };
}

export async function recognizeWithDeepSeek(apiKey: string, imageDataUrl: string, timeoutMs = 22000): Promise<unknown> {
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
      const payload = (await response.json()) as { error?: { message?: string } };
      detail = payload.error?.message ?? '';
    } catch {
      detail = '';
    }
    throw new Error(detail ? publicError(detail) : '识图服务暂时没有回应');
  }

  const payload = (await response.json()) as {
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

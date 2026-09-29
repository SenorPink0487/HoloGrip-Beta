import { parseRecognizedFigure, type RecognizedFigure } from './figureModel.ts';
import { apiBase } from '../../account/api.ts';

/** 压缩题目照片以控制视觉分析请求体积，确保快速返回结果。 */
export async function compressProblemImage(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined') return dataUrl;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('这张图片打不开'));
    img.src = dataUrl;
  });
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error('这张图片打不开');

  const maxEdge = 1024;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.7);
}

export async function recognizeStereometryImage(dataUrl: string): Promise<RecognizedFigure> {
  const image = await compressProblemImage(dataUrl);
  const configuredApi = import.meta.env.VITE_ACCOUNT_API_URL?.trim();
  const endpoint = configuredApi ? `${apiBase()}/api/math/recognize` : '/api/math/recognize';
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
      credentials: 'omit',
      signal: AbortSignal.timeout(40_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('识别超时，请再试一次');
    }
    throw new Error('连不上识图服务，请检查网络后重试');
  }

  const payload = await response.json().catch(() => ({})) as { error?: unknown; figure?: unknown };
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : '识图失败';
    throw new Error(message);
  }
  return parseRecognizedFigure(payload.figure);
}

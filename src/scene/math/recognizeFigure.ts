import { parseRecognizedFigure, type RecognizedFigure } from './figureModel.ts';
import { apiBase } from '../../account/api.ts';

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * 基于局部自适应背景对比度的试卷内容区智能裁切：
 * 当用户上传整页留白巨大的试卷照片（如 iPad 12MP 整张卷面仅中央一道题）时，
 * 自动定位印刷文字与几何线稿包围盒并保留充裕留白，使“上传整页图”与“近景取景框拍照”
 * 输入视觉模型的题目字号、线条像素密度完全一致，同时免疫桌面阴影和纸面灯光渐变。
 */
export function detectPaperContentCropFromPixels(
  rgba: Uint8ClampedArray,
  sampleW: number,
  sampleH: number,
  fullW: number,
  fullH: number
): CropRect {
  const fullRect: CropRect = { sx: 0, sy: 0, sw: fullW, sh: fullH };
  if (sampleW < 48 || sampleH < 48 || rgba.length < sampleW * sampleH * 4) {
    return fullRect;
  }

  // 忽略最外圈 5.5% 边缘（规避书桌木纹边缘、试卷微卷边露出的电脑壳或装订阴影）
  const marginX = Math.max(3, Math.round(sampleW * 0.055));
  const marginY = Math.max(3, Math.round(sampleH * 0.055));
  const x0 = marginX;
  const y0 = marginY;
  const x1 = sampleW - marginX;
  const y1 = sampleH - marginY;
  if (x1 - x0 < 32 || y1 - y0 < 32) return fullRect;

  // 1. 计算灰度亮度图并校验是否为浅色纸张/白板背景
  const lum = new Uint8Array(sampleW * sampleH);
  const hist = new Uint32Array(256);
  let interiorCount = 0;
  for (let y = y0; y < y1; y++) {
    const rowOff = y * sampleW;
    for (let x = x0; x < x1; x++) {
      const idx = (rowOff + x) * 4;
      const g = (rgba[idx] * 77 + rgba[idx + 1] * 150 + rgba[idx + 2] * 29) >> 8;
      lum[rowOff + x] = g;
      hist[g]++;
      interiorCount++;
    }
  }
  if (interiorCount === 0) return fullRect;

  // 取 75% 分位亮度作为全局纸底参考；若整体过暗（非白纸/浅灰试卷），则不做自动裁切
  const targetRank = Math.floor(interiorCount * 0.75);
  let acc = 0;
  let globalPaperLum = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= targetRank) {
      globalPaperLum = i;
      break;
    }
  }
  if (globalPaperLum < 120) return fullRect;

  // 2. 分块计算局部纸张背景亮度（85% 分位），消除台灯斜射或手影造成的纸面平滑明暗渐变
  const cellSize = 18;
  const gridCols = Math.ceil(sampleW / cellSize);
  const gridRows = Math.ceil(sampleH / cellSize);
  const cellBg = new Uint8Array(gridCols * gridRows);
  const cellBuf = new Uint8Array(cellSize * cellSize);

  for (let gy = 0; gy < gridRows; gy++) {
    const cy0 = Math.max(y0, gy * cellSize);
    const cy1 = Math.min(y1, (gy + 1) * cellSize);
    for (let gx = 0; gx < gridCols; gx++) {
      const cx0 = Math.max(x0, gx * cellSize);
      const cx1 = Math.min(x1, (gx + 1) * cellSize);
      let n = 0;
      for (let y = cy0; y < cy1; y++) {
        const rowOff = y * sampleW;
        for (let x = cx0; x < cx1; x++) {
          cellBuf[n++] = lum[rowOff + x];
        }
      }
      if (n === 0) {
        cellBg[gy * gridCols + gx] = globalPaperLum;
        continue;
      }
      const sub = cellBuf.subarray(0, n).slice().sort();
      cellBg[gy * gridCols + gx] = sub[Math.min(n - 1, Math.floor(n * 0.85))];
    }
  }

  // 3. 标记高对比度笔迹/印刷油墨像素（局部纸底亮度 - 像素亮度 >= 自适应阈值）
  // 同时校验 3x3 邻近网格块均属于纸张内部（85%分位亮度 >= 全局纸底 70%），彻底排除纸张边缘外的深色桌面/书本背景！
  const contrastThreshold = Math.max(30, Math.round(globalPaperLum * 0.19));
  const minPaperCellBg = Math.max(105, Math.round(globalPaperLum * 0.70));
  const isInteriorPaperCell = new Uint8Array(gridCols * gridRows);
  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      let allPaper = true;
      for (let dy = -1; dy <= 1 && allPaper; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= gridRows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx;
          if (nx < 0 || nx >= gridCols) continue;
          if (cellBg[ny * gridCols + nx] < minPaperCellBg) {
            allPaper = false;
            break;
          }
        }
      }
      if (allPaper) isInteriorPaperCell[gy * gridCols + gx] = 1;
    }
  }

  const inkMask = new Uint8Array(sampleW * sampleH);
  for (let y = y0; y < y1; y++) {
    const gy = Math.min(gridRows - 1, Math.floor(y / cellSize));
    const rowOff = y * sampleW;
    for (let x = x0; x < x1; x++) {
      const gx = Math.min(gridCols - 1, Math.floor(x / cellSize));
      const cellIdx = gy * gridCols + gx;
      if (!isInteriorPaperCell[cellIdx]) continue;
      const bg = cellBg[cellIdx];
      if (bg - lum[rowOff + x] >= contrastThreshold) {
        inkMask[rowOff + x] = 1;
      }
    }
  }

  // 4. 3x3 邻域去噪：剔除单像素纸张杂质噪点，统计真实笔迹包围盒
  let minX = sampleW;
  let minY = sampleH;
  let maxX = -1;
  let maxY = -1;
  let validInkCount = 0;

  for (let y = y0 + 1; y < y1 - 1; y++) {
    const rowOff = y * sampleW;
    for (let x = x0 + 1; x < x1 - 1; x++) {
      if (!inkMask[rowOff + x]) continue;
      const neighbors =
        inkMask[rowOff - sampleW + x - 1] +
        inkMask[rowOff - sampleW + x] +
        inkMask[rowOff - sampleW + x + 1] +
        inkMask[rowOff + x - 1] +
        inkMask[rowOff + x + 1] +
        inkMask[rowOff + sampleW + x - 1] +
        inkMask[rowOff + sampleW + x] +
        inkMask[rowOff + sampleW + x + 1];
      if (neighbors >= 1) {
        validInkCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const inkRatio = validInkCount / interiorCount;
  if (maxX <= minX || maxY <= minY || inkRatio < 0.0012 || inkRatio > 0.35) {
    return fullRect;
  }

  // 5. 四周扩展 14% 充裕安全留白，绝不裁掉边角顶点字母（如 D、A、E）或题号
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const padX = Math.max(Math.round(boxW * 0.14), Math.round(sampleW * 0.055));
  const padY = Math.max(Math.round(boxH * 0.16), Math.round(sampleH * 0.055));

  const cropX0 = Math.max(0, minX - padX);
  const cropY0 = Math.max(0, minY - padY);
  const cropX1 = Math.min(sampleW, maxX + 1 + padX);
  const cropY1 = Math.min(sampleH, maxY + 1 + padY);

  const cropAreaRatio = ((cropX1 - cropX0) * (cropY1 - cropY0)) / (sampleW * sampleH);
  // 若内容本已占满画面（面积 >= 76%）或异常过窄，保留原图
  if (cropAreaRatio >= 0.76 || cropX1 - cropX0 < sampleW * 0.14 || cropY1 - cropY0 < sampleH * 0.14) {
    return fullRect;
  }

  const scaleX = fullW / sampleW;
  const scaleY = fullH / sampleH;
  const sx = Math.max(0, Math.floor(cropX0 * scaleX));
  const sy = Math.max(0, Math.floor(cropY0 * scaleY));
  const sw = Math.min(fullW - sx, Math.ceil((cropX1 - cropX0) * scaleX));
  const sh = Math.min(fullH - sy, Math.ceil((cropY1 - cropY0) * scaleY));

  return sw > 64 && sh > 64 ? { sx, sy, sw, sh } : fullRect;
}

function detectPaperContentCrop(img: HTMLImageElement, width: number, height: number): CropRect {
  const fullRect: CropRect = { sx: 0, sy: 0, sw: width, sh: height };
  if (typeof document === 'undefined' || width < 320 || height < 320) return fullRect;

  try {
    const analysisMaxEdge = 360;
    const analysisScale = Math.min(1, analysisMaxEdge / Math.max(width, height));
    const sw = Math.max(1, Math.round(width * analysisScale));
    const sh = Math.max(1, Math.round(height * analysisScale));
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = sw;
    probeCanvas.height = sh;
    const probeCtx = probeCanvas.getContext('2d');
    if (!probeCtx || typeof probeCtx.getImageData !== 'function') return fullRect;
    probeCtx.fillStyle = '#ffffff';
    probeCtx.fillRect(0, 0, sw, sh);
    probeCtx.drawImage(img, 0, 0, sw, sh);
    const imageData = probeCtx.getImageData(0, 0, sw, sh);
    if (!imageData?.data) return fullRect;
    return detectPaperContentCropFromPixels(imageData.data, sw, sh, width, height);
  } catch {
    return fullRect;
  }
}

/** 归一化裁切并高清编码题目照片，使相册上传与相机实拍获得一致的高清晰度输入。 */
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

  const crop = detectPaperContentCrop(img, width, height);
  const maxEdge = 1440;
  const scale = Math.min(1, maxEdge / Math.max(crop.sw, crop.sh));
  const w = Math.max(1, Math.round(crop.sw * scale));
  const h = Math.max(1, Math.round(crop.sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  try {
    if ('filter' in ctx) {
      ctx.filter = 'contrast(1.26) brightness(1.05) saturate(0.25)';
    }
  } catch {
    // 兼容无 Canvas filter 的精简运行环境
  }
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
  try {
    if ('filter' in ctx) ctx.filter = 'none';
  } catch {
    // ignore
  }
  return canvas.toDataURL('image/jpeg', 0.82);
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
      signal: AbortSignal.timeout(26_000),
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

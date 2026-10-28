import * as THREE from 'three';

export interface ScientistPortrait {
  id: string;
  name: string;
  field: string;
  /** 放在 public/portraits，来源均为公有领域。 */
  file: string;
}

/**
 * 隔一格挂一幅，从正对入口的第一格起绕实验室一周。
 * 钱学森在视线正前方偏右的那一格。
 *
 * 图像来源（Wikimedia Commons，公有领域）：
 * 钱学森 Qian Xuesen in the US.jpg
 * 爱因斯坦 Einstein 1921 by F. Schmutzer
 * 居里夫人 Marie Curie c. 1920, Henri Manuel
 * 牛顿 Godfrey Kneller, 1689（牛顿没有留下照片）
 * 门捷列夫 Dmitri Mendeleev, 1890s
 * 法拉第 Michael Faraday, National Portrait Gallery
 */
export const SCIENTIST_PORTRAITS: readonly ScientistPortrait[] = [
  { id: 'qian-xuesen', name: '钱学森', field: '应用力学', file: '/portraits/qian.jpg' },
  { id: 'einstein', name: '爱因斯坦', field: '理论物理', file: '/portraits/einstein.jpg' },
  { id: 'curie', name: '居里夫人', field: '放射化学', file: '/portraits/curie.jpg' },
  { id: 'newton', name: '牛顿', field: '经典力学', file: '/portraits/newton.jpg' },
  { id: 'mendeleev', name: '门捷列夫', field: '化学', file: '/portraits/mendeleev.jpg' },
  { id: 'faraday', name: '法拉第', field: '电磁学', file: '/portraits/faraday.jpg' },
];

const PAPER = { warm: '#f4efe6', glacier: '#e7eef1' } as const;
const INK = { warm: '#2a241c', glacier: '#243034' } as const;
const RULE = { warm: '#b08958', glacier: '#8fa0a8' } as const;

export function paintNameplate(
  ctx: CanvasRenderingContext2D,
  portrait: ScientistPortrait,
  width: number,
  height: number,
  palette: 'warm' | 'glacier',
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PAPER[palette];
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = RULE[palette];
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, width - 16, height - 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK[palette];
  ctx.font = '600 84px "Songti SC", "STSong", "PingFang SC", serif';
  ctx.fillText(portrait.name, width / 2, height * 0.4);
  ctx.font = '400 36px "Songti SC", "STSong", "PingFang SC", serif';
  ctx.fillStyle = palette === 'warm' ? '#6d6254' : '#5c6c74';
  ctx.fillText(portrait.field, width / 2, height * 0.74);
}

export function fitPortrait(texture: THREE.Texture, planeAspect: number): void {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (width <= 0 || height <= 0) return;
  const imageAspect = width / height;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (imageAspect > planeAspect) {
    const repeatX = planeAspect / imageAspect;
    texture.repeat.set(repeatX, 1);
    texture.offset.set((1 - repeatX) * 0.5, 0);
  } else {
    const repeatY = imageAspect / planeAspect;
    texture.repeat.set(1, repeatY);
    texture.offset.set(0, (1 - repeatY) * 0.72);
  }
  texture.needsUpdate = true;
}

export function loadPortraitTexture(url: string, planeAspect: number): THREE.Texture {
  if (typeof Image === 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 5;
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    return fallback;
  }
  const loader = new THREE.TextureLoader();
  const texture = loader.load(url, (loaded) => fitPortrait(loaded, planeAspect));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createNameTexture(
  portrait: ScientistPortrait,
  palette: 'warm' | 'glacier',
): { texture: THREE.CanvasTexture; redraw: (next: 'warm' | 'glacier') => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const redraw = (next: 'warm' | 'glacier') => {
    if (ctx) paintNameplate(ctx, portrait, canvas.width, canvas.height, next);
    texture.needsUpdate = true;
  };
  redraw(palette);
  return { texture, redraw };
}

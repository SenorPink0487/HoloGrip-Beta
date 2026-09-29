import * as THREE from 'three';

export function labMetal(color: number, metalness = 0.84, roughness = 0.26): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

export function labGlow(color: number, intensity = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.35,
    roughness: 0.32,
  });
}

export function labGlass(opacity = 0.14): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xc9e7ff,
    metalness: 0.08,
    roughness: 0.04,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

type PaintCtx = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  clearRect: (x: number, y: number, w: number, h: number) => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  strokeRect?: (x: number, y: number, w: number, h: number) => void;
  fillText?: (text: string, x: number, y: number) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arc?: (x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean) => void;
  stroke: () => void;
  fill: () => void;
};

export function paintTexture(
  width: number,
  height: number,
  draw: (ctx: PaintCtx, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx && typeof ctx.fillRect === 'function') draw(ctx as PaintCtx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function outlined(mesh: THREE.Mesh, color = 0x93c5fd, opacity = 0.45): THREE.LineSegments {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  lines.position.copy(mesh.position);
  lines.rotation.copy(mesh.rotation);
  lines.scale.copy(mesh.scale);
  return lines;
}

export class ReadoutPanel {
  public readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private last = '';

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  }

  public write(lines: Array<{ text: string; color: string; size?: number }>): void {
    if (!this.mesh.visible) {
      this.last = '';
      return;
    }
    const key = lines.map((line) => line.text).join('|');
    if (key === this.last) return;
    this.last = key;
    const ctx = this.canvas.getContext('2d');
    if (!ctx || typeof ctx.fillRect !== 'function') return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#041018';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(56,189,248,0.45)';
    ctx.lineWidth = 4;
    if (typeof ctx.strokeRect === 'function') ctx.strokeRect(8, 8, w - 16, h - 16);
    lines.forEach((line, index) => {
      if (typeof ctx.fillText !== 'function') return;
      ctx.fillStyle = line.color;
      ctx.font = `600 ${line.size ?? 42}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(line.text, 28, 48 + index * 62);
    });
    this.texture.needsUpdate = true;
  }
}

export function aerospaceTitanium(color = 0x242a35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.88,
    roughness: 0.22,
  });
}

export function anodizedAluminum(color = 0x94a3b8, roughness = 0.28): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.78,
    roughness,
  });
}

export function polishedGold(color = 0xd4af37): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.95,
    roughness: 0.15,
  });
}

export function enameledCopper(color = 0xb45309): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: 0x7c2d12,
    emissiveIntensity: 0.18,
    metalness: 0.85,
    roughness: 0.24,
  });
}

export function opticalQuartz(color = 0x8ec5fc, opacity = 0.12): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.1,
    roughness: 0.06,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createJumperLead(
  points: THREE.Vector3[],
  color: number,
  radius = 0.0028,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 32, radius, 8, false);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.2,
  });
  return new THREE.Mesh(geometry, material);
}

export function dialTexture(): THREE.CanvasTexture {
  return paintTexture(512, 512, (ctx, w, h) => {
    // 1. 仪表搪瓷表盘底色
    ctx.fillStyle = '#0a1017';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 + 30;

    // 外层细边框
    ctx.strokeStyle = 'rgba(56,189,248,0.35)';
    ctx.lineWidth = 2;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(8, 8, w - 16, h - 16);
    }

    // 2. 防视差反射镜条
    if (typeof ctx.arc === 'function') {
      ctx.beginPath();
      ctx.arc(cx, cy, 140, Math.PI * 0.2, Math.PI * 0.8, true);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 8;
      ctx.stroke();

      // 主刻度基准弧线
      ctx.beginPath();
      ctx.arc(cx, cy, 185, Math.PI * 0.18, Math.PI * 0.82, true);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 3. 分度刻度线（-50 至 +50，中心为零）
    const maxSteps = 10;
    for (let i = -maxSteps; i <= maxSteps; i++) {
      const angle = -Math.PI / 2 + (i / maxSteps) * 1.05;
      const isMajor = i % 2 === 0;
      const inner = isMajor ? 152 : 168;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(angle) * inner, cy - Math.cos(angle) * inner);
      ctx.lineTo(cx + Math.sin(angle) * 185, cy - Math.cos(angle) * 185);
      ctx.strokeStyle = isMajor ? '#f8fafc' : 'rgba(203,213,225,0.7)';
      ctx.lineWidth = isMajor ? 3 : 1.5;
      ctx.stroke();

      if (typeof ctx.fillText === 'function' && isMajor) {
        ctx.fillStyle = i === 0 ? '#38bdf8' : '#e2e8f0';
        ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = String(i * 10);
        ctx.fillText(label, cx + Math.sin(angle) * 122, cy - Math.cos(angle) * 122);
      }
    }

    // 4. 中心 G 标识与工程标记
    if (typeof ctx.fillText === 'function') {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 34px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('G', cx, cy - 28);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 18px monospace';
      ctx.fillText('GALVANOMETER ±50mA', cx, cy + 50);

      ctx.font = '400 13px monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.fillText('CLASS 0.5 | 50Ω COIL', cx, cy + 74);
    }
  });
}

export function graticuleTexture(): THREE.CanvasTexture {
  return paintTexture(512, 512, (ctx, w, h) => {
    // 1. 带柔和荧光光晕的暗色荧光 CRT 屏幕背景
    ctx.fillStyle = '#02120a';
    ctx.fillRect(0, 0, w, h);

    // 细微的 CRT 屏幕内阴影边框
    ctx.strokeStyle = 'rgba(74,222,128,0.45)';
    ctx.lineWidth = 3;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(6, 6, w - 12, h - 12);
    }

    // 2. 次级细分刻度线
    ctx.strokeStyle = 'rgba(74,222,128,0.18)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 16; i++) {
      const x = (w * i) / 16;
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(x, h - 16);
      ctx.stroke();

      const y = (h * i) / 16;
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(w - 16, y);
      ctx.stroke();
    }

    // 3. 主要 8x8 分割网格线
    ctx.strokeStyle = 'rgba(74,222,128,0.42)';
    ctx.lineWidth = 1.8;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((w * i) / 8, 16);
      ctx.lineTo((w * i) / 8, h - 16);
      ctx.moveTo(16, (h * i) / 8);
      ctx.lineTo(w - 16, (h * i) / 8);
      ctx.stroke();
    }

    // 4. 带有亚毫米刻度标记的中心主坐标轴（H 与 B 轴）
    ctx.strokeStyle = 'rgba(187,247,208,0.92)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(16, h / 2);
    ctx.lineTo(w - 16, h / 2);
    ctx.moveTo(w / 2, 16);
    ctx.lineTo(w / 2, h - 16);
    ctx.stroke();

    // 中心坐标轴刻度线
    for (let i = 1; i < 32; i++) {
      const x = (w * i) / 32;
      ctx.beginPath();
      ctx.moveTo(x, h / 2 - 4);
      ctx.lineTo(x, h / 2 + 4);
      ctx.stroke();

      const y = (h * i) / 32;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 4, y);
      ctx.lineTo(w / 2 + 4, y);
      ctx.stroke();
    }

    // 5. 工程排版与坐标轴标识
    if (typeof ctx.fillText === 'function') {
      ctx.fillStyle = '#86efac';
      ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('+B (T)', w / 2 + 14, 38);
      ctx.fillText('+H (A/m)', w - 96, h / 2 - 14);
      ctx.fillText('-H', 24, h / 2 - 14);
      ctx.fillText('-B', w / 2 + 14, h - 24);

      ctx.font = '400 14px monospace';
      ctx.fillStyle = 'rgba(134,239,172,0.65)';
      ctx.fillText('DIGITAL B-H ANALYZER | 50Hz', 24, 38);
    }
  });
}

export function plateTexture(): THREE.CanvasTexture {
  return paintTexture(256, 1024, (ctx, w, h) => {
    // 1. 感光底片 / MCP 探测器表面（深空灰金属底衬）
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // 2. 荧光离子收集通道条
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(28, 16, w - 56, h - 32);

    // 边框倒角
    ctx.strokeStyle = 'rgba(56,189,248,0.5)';
    ctx.lineWidth = 2;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(28, 16, w - 56, h - 32);
    }

    // 3. 激光蚀刻毫米刻度与质荷比（m/z）标定网格
    ctx.strokeStyle = 'rgba(226,232,240,0.6)';
    ctx.lineWidth = 1.5;
    const ticks = 32;
    for (let i = 0; i <= ticks; i++) {
      const y = 24 + ((h - 48) * i) / ticks;
      const isMajor = i % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(isMajor ? 80 : 54, y);
      ctx.stroke();

      if (typeof ctx.fillText === 'function' && isMajor) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 18px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const distMm = ((i - ticks / 2) * 10).toFixed(0);
        ctx.fillText(`${distMm > '0' ? '+' : ''}${distMm}mm`, 92, y);
      }
    }

    if (typeof ctx.fillText === 'function') {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MCP DETECTOR', w / 2, 48);
      ctx.font = '500 16px monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      ctx.fillText('FOCAL PLANE 2r', w / 2, 74);
    }
  });
}

export function softDiscTexture(): THREE.CanvasTexture {
  return paintTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, w, h);
    if (typeof ctx.arc === 'function') {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 46, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function letterTexture(letter: string, color: string): THREE.CanvasTexture {
  return paintTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);
    if (typeof ctx.fillText === 'function') {
      ctx.fillStyle = color;
      ctx.font = '700 84px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, w / 2, h / 2 + 4);
    }
  });
}

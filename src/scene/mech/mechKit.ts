/**
 * HoloGrip 力学 3D 实验设备工业级建模与材质工具函数库 (Optical-Grade Precision Mechanics Kit)
 * 遵循光学实验标准：航天级喷砂银铝、镜面液态铬、精密香槟黄铜滚花构件、激光蚀刻高对比度标尺与深海蓝黑显示面板。
 */

import * as THREE from 'three';
import {
  createChamferedHexNut,
  createGuideShaftGeometry,
  createKnurledBand,
} from '../em/conductorRod.ts';
import { createChamferedBlockGeometry } from '../optics/OpticalBenchRail.ts';

export {
  createChamferedHexNut,
  createGuideShaftGeometry,
  createKnurledBand,
  createChamferedBlockGeometry,
};

/** 安全创建 HTML5 离屏 Canvas */
export function safeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    if (!c || typeof (c as any).getContext !== 'function') return null;
    const ctx = c.getContext('2d');
    if (!ctx || typeof (ctx as any).fillRect !== 'function') return null;
    c.width = width;
    c.height = height;
    return c;
  } catch {
    return null;
  }
}

/** 传统基础金属材质函数 (保持向后兼容) */
export function mechMetal(
  color: number = 0x94a3b8,
  metalness = 0.85,
  roughness = 0.25
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

/** 1. 航天级阳极氧化喷砂银铝材质 (Aerospace Satin Silver Anodized Aluminum) */
export function createSatinSilverMaterial(
  color: number = 0xf1f5f9,
  metalness = 0.72,
  roughness = 0.25
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
  });
}

/** 2. 镜面抛光液态铬 / 316L 不锈钢材质 (Mirror Polished Liquid Chrome 316L) */
export function createLiquidChromeMaterial(
  color: number = 0xffffff,
  metalness = 0.98,
  roughness = 0.08
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
  });
}

/** 3. 银灰钛金精密调节五金构件材质 (Titanium Hardware: 0xc4cbd4，遵循光学科研级标准，彻底杜绝廉价亮黄) */
export function createChampagneBrassMaterial(
  color: number = 0xc4cbd4,
  metalness = 0.85,
  roughness = 0.22
): THREE.MeshStandardMaterial {
  // 彻底杜绝廉价亮黄：将旧版高饱和黄/橙黄自动重映射为纯正光学科研级银灰钛金 (0xc4cbd4)
  const c =
    color === 0xf59e0b || color === 0xd97706 || color === 0xfbbf24 || color === 0xd4af37
      ? 0xc4cbd4
      : color;
  return new THREE.MeshStandardMaterial({
    color: c,
    metalness,
    roughness,
  });
}

/** 3b. 精密银灰钛金五金构件标准别名 */
export const createTitaniumHardwareMaterial = createChampagneBrassMaterial;

/** 4. 精密机加工钛晶深灰材质 (Precision Titanium Slate / Gunmetal) */
export function createTitaniumSlateMaterial(
  color: number = 0x334155,
  metalness = 0.80,
  roughness = 0.28
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
  });
}

/** 5. 深邃海洋蓝黑显示与读数面板材质 (Deep Oceanic Sapphire Display) */
export function createOceanicSapphireMaterial(
  color: number = 0x0a192f,
  metalness = 0.25,
  roughness = 0.30
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
  });
}

/** 6. 高透明光学级纯净物理玻璃/亚克力材质 (Physical Clear Optical Glass) */
export function createOpticalGlassMaterial(options: {
  color?: number;
  opacity?: number;
  roughness?: number;
  transmission?: number;
} = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: options.color ?? 0xf8fafc,
    roughness: options.roughness ?? 0.05,
    metalness: 0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transmission: options.transmission ?? 0.88,
    ior: 1.517,
    reflectivity: 0.90,
    transparent: true,
    opacity: options.opacity ?? 0.30,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

/** 7. 四角防震微调脚垫橡胶/高阻尼材质 (Vibration Isolator Footpad) */
export function createLevelingPadMaterial(
  color: number = 0x0f172a,
  roughness = 0.85
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.1,
  });
}

/**
 * 8. 创建光学科研级激光蚀刻毫米/厘米钢尺纹理 (High-contrast Laser-etched Precision Rule)
 */
export function createPrecisionRulerTexture(options: {
  width?: number;
  height?: number;
  maxCm?: number;
  bgColor?: string;
  tickColor?: string;
  textColor?: string;
  accentColor?: string;
  unitText?: string;
}): THREE.CanvasTexture | null {
  const width = options.width ?? 1024;
  const height = options.height ?? 128;
  const maxCm = options.maxCm ?? 50;
  const bgColor = options.bgColor ?? '#f1f5f9';
  const tickColor = options.tickColor ?? '#1e293b';
  const textColor = options.textColor ?? '#0f172a';
  const accentColor = options.accentColor ?? '#0284c7';
  const unitText = options.unitText ?? 'cm';

  const canvas = safeCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. 亮底细腻喷砂金属背景
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // 2. 上下精磨边缘亮条
  const edgeH = Math.max(2, Math.round(height * 0.04));
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, width, edgeH);
  ctx.fillRect(0, height - edgeH, width, edgeH);

  // 3. 激光蚀刻基准主线
  const baselineY = Math.round(height * 0.72);
  ctx.strokeStyle = tickColor;
  ctx.lineWidth = Math.max(2, Math.round(height * 0.025));
  ctx.beginPath();
  ctx.moveTo(0, baselineY);
  ctx.lineTo(width, baselineY);
  ctx.stroke();

  // 4. 毫米与厘米刻度线
  const marginPx = Math.round(width * 0.03);
  const activeSpan = width - marginPx * 2;
  const pxPerCm = activeSpan / maxCm;
  const tickTop = Math.round(height * 0.14);
  const majorLen = Math.round(height * 0.45);
  const midLen = Math.round(height * 0.30);
  const minorLen = Math.round(height * 0.18);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = `bold ${Math.round(height * 0.32)}px "SF Mono", "SF Pro Display", -apple-system, monospace`;

  for (let cm = 0; cm <= maxCm; cm++) {
    const x = marginPx + cm * pxPerCm;
    const isMajor = cm % 10 === 0;
    const isMid = cm % 5 === 0 && !isMajor;

    ctx.strokeStyle = isMajor ? accentColor : tickColor;
    ctx.lineWidth = isMajor ? Math.max(3, Math.round(height * 0.028)) : isMid ? Math.max(2, Math.round(height * 0.018)) : Math.max(1, Math.round(height * 0.010));

    const len = isMajor ? majorLen : isMid ? midLen : minorLen;
    ctx.beginPath();
    ctx.moveTo(x, baselineY);
    ctx.lineTo(x, baselineY - len);
    ctx.stroke();

    if (isMajor) {
      ctx.fillStyle = textColor;
      ctx.fillText(`${cm}`, x, baselineY - len - 4);
    }

    if (cm < maxCm) {
      const pxPerMm = pxPerCm / 10;
      for (let mm = 1; mm < 10; mm++) {
        if (mm === 5) continue;
        const mx = x + mm * pxPerMm;
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = Math.max(1, Math.round(height * 0.008));
        ctx.beginPath();
        ctx.moveTo(mx, baselineY);
        ctx.lineTo(mx, baselineY - minorLen);
        ctx.stroke();
      }
      // 5mm 刻度
      const m5x = x + 5 * pxPerMm;
      ctx.strokeStyle = tickColor;
      ctx.lineWidth = Math.max(1.5, Math.round(height * 0.014));
      ctx.beginPath();
      ctx.moveTo(m5x, baselineY);
      ctx.lineTo(m5x, baselineY - midLen);
      ctx.stroke();
    }
  }

  // 标尺单位
  if (unitText) {
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${Math.round(height * 0.24)}px "SF Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(unitText, width - marginPx + 4, baselineY - 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** 遍历释放 3D 节点及其几何、材质与纹理 */
export function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of list) {
      materials.add(item);
      for (const value of Object.values(item)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

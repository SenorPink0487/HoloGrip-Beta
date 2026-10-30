import * as THREE from 'three';
import { createChamferedHexNut, createKnurledBand } from '../em/conductorRod.ts';

/**
 * 光具座底座：缎面银铝床身、嵌槽液态铬滑杆、亮底蚀刻标尺、香槟金滚花调平脚。
 * 顶面高度保持在 height，滑座仍落在原光轴基准上。
 */
export interface PrecisionOpticalRail {
  group: THREE.Group;
  scaleCanvas: HTMLCanvasElement | null;
  scaleTexture: THREE.CanvasTexture | null;
}

export function createChamferedBlockGeometry(
  width: number,
  height: number,
  depth: number,
  bevel = 0.0016
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const b = Math.min(bevel, width * 0.18, height * 0.18);
  const hw = width * 0.5 - b;
  const hh = height * 0.5 - b;

  shape.moveTo(-hw, -hh - b);
  shape.lineTo(hw, -hh - b);
  shape.lineTo(hw + b, -hh);
  shape.lineTo(hw + b, hh);
  shape.lineTo(hw, hh + b);
  shape.lineTo(-hw, hh + b);
  shape.lineTo(-hw - b, hh);
  shape.lineTo(-hw - b, -hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.0008, depth - b * 2),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function safeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  } catch {
    return null;
  }
}

export interface OpticalRailFinish {
  satin: number;
  skirt: number;
  channel: number;
  chrome: number;
  brass: number;
  scaleBackground: string;
  scaleEdge: string;
  scaleTick: string;
  scaleAccent: string;
}

const DEFAULT_RAIL_FINISH: OpticalRailFinish = {
  satin: 0xe8eef5,
  skirt: 0xf8fafc,
  channel: 0xd5dee8,
  chrome: 0xffffff,
  brass: 0xd97706,
  scaleBackground: '#f8fafc',
  scaleEdge: '#cbd5e1',
  scaleTick: '#334155',
  scaleAccent: '#b45309',
};

function channelLuma(hex: string): number {
  const h = hex.replace('#', '');
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = lin(parseInt(h.slice(0, 2), 16) / 255);
  const g = lin(parseInt(h.slice(2, 4), 16) / 255);
  const b = lin(parseInt(h.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 数字必须和尺面拉开对比。香槟金贴在灰尺上会融掉，就改用刻度线同色。 */
function numeralInk(finish: OpticalRailFinish): string {
  const accent = channelLuma(finish.scaleAccent);
  const paper = channelLuma(finish.scaleBackground);
  const contrast = (Math.max(accent, paper) + 0.05) / (Math.min(accent, paper) + 0.05);
  return contrast >= 3 ? finish.scaleAccent : finish.scaleTick;
}

function paintSteelRule(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  finish: OpticalRailFinish,
): void {
  ctx.fillStyle = finish.scaleBackground;
  ctx.fillRect(0, 0, width, height);

  const edge = Math.max(2, Math.round(height * 0.015));
  ctx.fillStyle = finish.scaleEdge;
  ctx.fillRect(0, 0, width, edge);
  ctx.fillRect(0, height - edge, width, edge);

  const scaleStartX = Math.round(width * 0.04);
  const scaleEndX = Math.round(width * 0.9);
  const scaleSpan = scaleEndX - scaleStartX;
  const tickTop = Math.round(height * 0.05);
  const majorBottom = Math.round(height * 0.4);
  const cmBottom = Math.round(height * 0.28);
  const fiveBottom = Math.round(height * 0.18);
  const mmBottom = Math.round(height * 0.11);
  const labelY = Math.round(height * 0.7);
  const ink = numeralInk(finish);

  ctx.strokeStyle = finish.scaleTick;
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(height * 0.38)}px "SF Mono", "PingFang SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineCap = 'butt';

  for (let cm = 0; cm <= 100; cm++) {
    const pxCm = scaleStartX + (cm / 100) * scaleSpan;
    ctx.strokeStyle = finish.scaleTick;
    ctx.lineWidth = cm % 10 === 0 ? Math.max(3, height * 0.02) : Math.max(2, height * 0.012);
    ctx.beginPath();
    ctx.moveTo(pxCm, tickTop);
    ctx.lineTo(pxCm, cm % 10 === 0 ? majorBottom : cmBottom);
    ctx.stroke();

    if (cm % 10 === 0) {
      ctx.fillStyle = ink;
      ctx.fillText(String(cm), pxCm, labelY);
    }

    if (cm < 100) {
      const millimetre = scaleSpan / 1000;
      for (let mm = 1; mm < 10; mm++) {
        const pxMm = pxCm + mm * millimetre;
        const is5 = mm === 5;
        ctx.lineWidth = is5 ? Math.max(2, height * 0.01) : Math.max(1, height * 0.005);
        ctx.beginPath();
        ctx.moveTo(pxMm, tickTop);
        ctx.lineTo(pxMm, is5 ? fiveBottom : mmBottom);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(height * 0.2)}px "SF Mono", "PingFang SC", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('cm', scaleEndX + Math.round(width * 0.012), labelY);
}

function addMesh(
  parent: THREE.Group,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  name: string
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function buildPrecisionOpticalRail(options: {
  length: number;
  width: number;
  height: number;
  name?: string;
  finish?: OpticalRailFinish;
}): PrecisionOpticalRail {
  const { length, width, height } = options;
  const tuned = options.finish != null;
  const finish = options.finish ?? DEFAULT_RAIL_FINISH;
  const group = new THREE.Group();
  group.name = options.name ?? 'RailGroup';

  const satin = new THREE.MeshStandardMaterial({
    color: finish.satin,
    metalness: tuned ? 0.58 : 0.62,
    roughness: tuned ? 0.4 : 0.28,
  });
  const satinSkirt = new THREE.MeshStandardMaterial({
    color: finish.skirt,
    metalness: tuned ? 0.6 : 0.7,
    roughness: tuned ? 0.36 : 0.22,
  });
  const channel = new THREE.MeshStandardMaterial({
    color: finish.channel,
    metalness: 0.48,
    roughness: tuned ? 0.42 : 0.34,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: finish.chrome,
    metalness: tuned ? 0.7 : 0.98,
    roughness: tuned ? 0.26 : 0.08,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: finish.brass,
    metalness: tuned ? 0.72 : 0.9,
    roughness: tuned ? 0.36 : 0.24,
  });

  const skirtH = height * 0.34;
  const bodyH = height - skirtH;
  addMesh(
    group,
    createChamferedBlockGeometry(length, skirtH, width * 1.08, 0.002),
    satinSkirt,
    0,
    skirtH * 0.5,
    0,
    'RailSkirt'
  );
  addMesh(
    group,
    createChamferedBlockGeometry(length * 0.992, bodyH, width, 0.0018),
    satin,
    0,
    skirtH + bodyH * 0.5,
    0,
    'RailBed'
  );

  const wayZ = width * 0.28;
  for (const z of [wayZ, -wayZ]) {
    addMesh(
      group,
      new THREE.BoxGeometry(length * 0.955, 0.0024, 0.012),
      channel,
      0,
      height - 0.0011,
      z,
      'RailWayChannel'
    );
  }

  const rodRadius = 0.0042;
  const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, length * 0.97, 28);
  rodGeo.rotateZ(Math.PI / 2);
  for (const z of [wayZ, -wayZ]) {
    const rod = addMesh(group, rodGeo, chrome, 0, height + rodRadius * 0.42, z, 'RailWayRod');
    rod.castShadow = true;
  }

  const filletGeo = new THREE.CylinderGeometry(0.0015, 0.0015, length * 0.96, 12);
  filletGeo.rotateZ(Math.PI / 2);
  addMesh(group, filletGeo, chrome, 0, height - 0.0016, width * 0.5 - 0.0022, 'RailFrontFillet');

  const cheekW = 0.018;
  const yokeD = Math.max(0.146, width * 2.05);
  const xEnds = [-length * 0.5 - cheekW * 0.45, length * 0.5 + cheekW * 0.45];

  for (const xPos of xEnds) {
    const side = Math.sign(xPos) || 1;
    addMesh(
      group,
      createChamferedBlockGeometry(cheekW, height * 0.96, width * 0.98, 0.0016),
      satin,
      xPos,
      height * 0.48,
      0,
      'RailEndCheek'
    );
    addMesh(
      group,
      new THREE.BoxGeometry(0.0015, height * 0.62, width * 0.46),
      brass,
      xPos + side * cheekW * 0.42,
      height * 0.5,
      0,
      'RailEndInlay'
    );

    const stop = addMesh(
      group,
      createKnurledBand(0.0062, 0.012),
      brass,
      xPos,
      height + 0.007,
      0,
      'RailStopScrew'
    );
    stop.castShadow = true;

    addMesh(
      group,
      createChamferedBlockGeometry(0.02, 0.011, yokeD, 0.0015),
      satinSkirt,
      xPos,
      0.0045,
      0,
      'RailOutrigger'
    );

    for (const zPos of [-yokeD * 0.38, yokeD * 0.38]) {
      addMesh(
        group,
        new THREE.CylinderGeometry(0.0034, 0.0034, 0.016, 16),
        chrome,
        xPos,
        -0.006,
        zPos,
        'RailLevelStud'
      );
      addMesh(
        group,
        createChamferedHexNut(0.0072, 0.0045),
        brass,
        xPos,
        0.001,
        zPos,
        'RailLevelNut'
      );
      addMesh(
        group,
        createKnurledBand(0.012, 0.0075),
        brass,
        xPos,
        -0.014,
        zPos,
        'RailLevelFoot'
      );
    }
  }

  let scaleCanvas: HTMLCanvasElement | null = null;
  let scaleTexture: THREE.CanvasTexture | null = null;
  // 贴图宽高比跟尺面一致，数字才不会被拉成一条扁线。
  const plateW = length * 0.93;
  const plateH = height * 0.82;
  const canvasH = 192;
  const canvasW = Math.min(8192, Math.max(2048, Math.round(canvasH * (plateW / Math.max(plateH, 0.001)))));
  scaleCanvas = safeCanvas(canvasW, canvasH);
  if (scaleCanvas) {
    const ctx = scaleCanvas.getContext('2d');
    if (ctx) paintSteelRule(ctx, canvasW, canvasH, finish);
    scaleTexture = new THREE.CanvasTexture(scaleCanvas);
    scaleTexture.anisotropy = 16;
    scaleTexture.colorSpace = THREE.SRGBColorSpace;
    const plate = addMesh(
      group,
      new THREE.PlaneGeometry(plateW, plateH),
      new THREE.MeshStandardMaterial({
        map: scaleTexture,
        color: 0xffffff,
        metalness: 0.04,
        roughness: 0.62,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      0,
      height * 0.48,
      width * 0.5 + 0.0014,
      'RailScale'
    );
    plate.castShadow = false;
  }

  return { group, scaleCanvas, scaleTexture };
}

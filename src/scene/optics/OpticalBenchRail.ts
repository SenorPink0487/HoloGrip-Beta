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

function paintSteelRule(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, width, 3);
  ctx.fillRect(0, height - 3, width, 3);

  ctx.strokeStyle = '#334155';
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 32px -apple-system, "SF Mono", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const scaleStartX = 72;
  const scaleEndX = width - 128;
  const scaleSpan = scaleEndX - scaleStartX;

  for (let cm = 0; cm <= 100; cm++) {
    const pxCm = scaleStartX + (cm / 100) * scaleSpan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pxCm, 6);
    ctx.lineTo(pxCm, cm % 10 === 0 ? 52 : 40);
    ctx.stroke();

    if (cm % 10 === 0) {
      ctx.fillStyle = '#b45309';
      ctx.fillText(`${cm}`, pxCm, 60);
      ctx.fillStyle = '#334155';
    }

    if (cm < 100) {
      for (let mm = 1; mm < 10; mm++) {
        const pxMm = pxCm + (mm / 10) * (scaleSpan / 100);
        const is5 = mm === 5;
        ctx.lineWidth = is5 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(pxMm, 6);
        ctx.lineTo(pxMm, is5 ? 28 : 16);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = '#b45309';
  ctx.font = 'bold 28px "SF Mono", sans-serif';
  ctx.fillText('cm', scaleEndX + 52, 60);
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
}): PrecisionOpticalRail {
  const { length, width, height } = options;
  const group = new THREE.Group();
  group.name = options.name ?? 'RailGroup';

  const satin = new THREE.MeshStandardMaterial({
    color: 0xe8eef5,
    metalness: 0.62,
    roughness: 0.28,
  });
  const satinSkirt = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.7,
    roughness: 0.22,
  });
  const channel = new THREE.MeshStandardMaterial({
    color: 0xd5dee8,
    metalness: 0.48,
    roughness: 0.34,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.98,
    roughness: 0.08,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.9,
    roughness: 0.24,
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
  scaleCanvas = safeCanvas(2048, 128);
  if (scaleCanvas) {
    const ctx = scaleCanvas.getContext('2d');
    if (ctx) paintSteelRule(ctx, 2048, 128);
    scaleTexture = new THREE.CanvasTexture(scaleCanvas);
    scaleTexture.anisotropy = 8;
    scaleTexture.colorSpace = THREE.SRGBColorSpace;
    const plate = addMesh(
      group,
      new THREE.PlaneGeometry(length * 0.93, height * 0.56),
      new THREE.MeshStandardMaterial({
        map: scaleTexture,
        color: 0xffffff,
        metalness: 0.18,
        roughness: 0.38,
      }),
      0,
      height * 0.46,
      width * 0.5 + 0.0011,
      'RailScale'
    );
    plate.castShadow = false;
  }

  return { group, scaleCanvas, scaleTexture };
}

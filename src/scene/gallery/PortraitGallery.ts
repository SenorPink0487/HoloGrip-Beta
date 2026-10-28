import * as THREE from 'three';
import { galleryPalette, type GalleryPalette, type GalleryPaletteId } from './palette.ts';
import { SCIENTIST_PORTRAITS, createNameTexture, loadPortraitTexture } from './portraits.ts';

/** 墙面竖缝数量。缝与缝之间是一格。 */
export const WALL_BAY_COUNT = 12;
/** 一格挂画，下一格留白。 */
export const PORTRAIT_BAY_STRIDE = 2;
export const PORTRAIT_CENTER_Y = 1.68;

const PHOTO_W = 0.86;
const PHOTO_H = 1.12;
const MAT_X = 0.108;
const MAT_TOP = 0.096;
const MAT_BOTTOM = 0.112;
const RAIL = 0.015;
const SIGHT = 0.007;
const OPEN_W = PHOTO_W + MAT_X * 2;
const OPEN_H = PHOTO_H + MAT_TOP + MAT_BOTTOM;
const FRAME_W = OPEN_W + RAIL * 2;
const FRAME_H = OPEN_H + RAIL * 2;
const PHOTO_Y = (MAT_BOTTOM - MAT_TOP) / 2;
const NAME_W = 0.5;
const NAME_H = NAME_W * (280 / 1024);

export function portraitBayPhi(index: number): number {
  const step = (Math.PI * 2) / WALL_BAY_COUNT;
  return (index * PORTRAIT_BAY_STRIDE + 0.5) * step;
}

function addRoundedRect(path: THREE.Path, x: number, y: number, w: number, h: number, r: number, clockwise: boolean): void {
  if (!clockwise) {
    path.moveTo(x + r, y);
    path.lineTo(x + w - r, y);
    path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    path.lineTo(x + w, y + h - r);
    path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    path.lineTo(x + r, y + h);
    path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    path.lineTo(x, y + r);
    path.absarc(x + r, y + r, r, Math.PI, Math.PI * 3 / 2, false);
    return;
  }
  path.moveTo(x + r, y);
  path.absarc(x + r, y + r, r, -Math.PI / 2, Math.PI, true);
  path.lineTo(x, y + h - r);
  path.absarc(x + r, y + h - r, r, Math.PI, Math.PI / 2, true);
  path.lineTo(x + w - r, y + h);
  path.absarc(x + w - r, y + h - r, r, Math.PI / 2, 0, true);
  path.lineTo(x + w, y + r);
  path.absarc(x + w - r, y + r, r, 0, -Math.PI / 2, true);
  path.lineTo(x + r, y);
}

/** 窄压条：外沿圆角，中间挖空，倒角只压在条的棱上。 */
function molding(outerW: number, outerH: number, border: number, outerR: number, holeR: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  addRoundedRect(shape, -outerW / 2, -outerH / 2, outerW, outerH, outerR, false);
  const hole = new THREE.Path();
  addRoundedRect(
    hole,
    -outerW / 2 + border,
    -outerH / 2 + border,
    outerW - border * 2,
    outerH - border * 2,
    holeR,
    true,
  );
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: Math.min(0.0016, depth * 0.2),
    bevelSize: Math.min(0.0016, border * 0.22),
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geometry.computeBoundingBox();
  geometry.translate(0, 0, -(geometry.boundingBox?.max.z ?? 0));
  return geometry;
}

/**
 * 博物馆挂法：细铜压条、宽衬纸、内沿压住照片、
 * 框下另悬一块铭牌。不再用一整圈粗铜框。
 */
export class PortraitGallery {
  public readonly group = new THREE.Group();
  private readonly frameMat: THREE.MeshStandardMaterial;
  private readonly sightMat: THREE.MeshStandardMaterial;
  private readonly matMat: THREE.MeshStandardMaterial;
  private readonly contactMat: THREE.MeshStandardMaterial;
  private readonly redrawLabels: Array<(palette: 'warm' | 'glacier') => void> = [];

  constructor(wallRadius: number) {
    this.group.name = 'portrait-gallery';
    this.frameMat = new THREE.MeshStandardMaterial({
      color: 0xb08958,
      roughness: 0.42,
      metalness: 0.7,
      envMapIntensity: 0.85,
      side: THREE.DoubleSide,
    });
    this.sightMat = new THREE.MeshStandardMaterial({
      color: 0x7a5e3c,
      roughness: 0.48,
      metalness: 0.62,
      envMapIntensity: 0.7,
      side: THREE.DoubleSide,
    });
    this.matMat = new THREE.MeshStandardMaterial({
      color: 0xf3ecdf,
      roughness: 0.86,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.contactMat = new THREE.MeshStandardMaterial({
      color: 0xb7aea0,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    const railGeometry = molding(FRAME_W, FRAME_H, RAIL, 0.008, 0.005, 0.012);
    const sightW = PHOTO_W + SIGHT * 2;
    const sightH = PHOTO_H + SIGHT * 2;
    const sightGeometry = molding(sightW, sightH, SIGHT, 0.003, 0.002, 0.006);
    const labelGeometry = molding(NAME_W + 0.016, NAME_H + 0.016, 0.006, 0.004, 0.003, 0.006);
    const mountRadius = wallRadius - 0.07;
    const planeAspect = PHOTO_W / PHOTO_H;

    SCIENTIST_PORTRAITS.forEach((portrait, index) => {
      const phi = portraitBayPhi(index);
      const frame = new THREE.Group();
      frame.name = `portrait-${portrait.id}`;
      frame.userData = { scientist: portrait.name, field: portrait.field, phi };
      frame.position.set(Math.sin(phi) * mountRadius, PORTRAIT_CENTER_Y, -Math.cos(phi) * mountRadius);
      frame.rotation.y = -phi;

      const contact = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_W + 0.06, FRAME_H + 0.06), this.contactMat);
      contact.name = 'frame-contact';
      contact.position.z = -0.04;
      frame.add(contact);

      const mat = new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W, OPEN_H), this.matMat);
      mat.name = 'frame-mat';
      mat.position.z = -0.01;
      frame.add(mat);

      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(PHOTO_W, PHOTO_H),
        new THREE.MeshStandardMaterial({
          map: loadPortraitTexture(portrait.file, planeAspect),
          roughness: 0.94,
          metalness: 0,
          envMapIntensity: 0.06,
        }),
      );
      plate.name = 'portrait-plate';
      plate.position.set(0, PHOTO_Y, -0.006);
      frame.add(plate);

      const sight = new THREE.Mesh(sightGeometry, this.sightMat);
      sight.name = 'frame-sight';
      sight.position.set(0, PHOTO_Y, -0.003);
      frame.add(sight);

      const rail = new THREE.Mesh(railGeometry, this.frameMat);
      rail.name = 'frame-rail';
      frame.add(rail);

      const labelY = -FRAME_H / 2 - 0.046 - NAME_H / 2;
      const backing = new THREE.Mesh(labelGeometry, this.frameMat);
      backing.name = 'frame-label-rim';
      backing.position.set(0, labelY, -0.002);
      frame.add(backing);

      const named = createNameTexture(portrait, 'warm');
      this.redrawLabels.push(named.redraw);
      const name = new THREE.Mesh(
        new THREE.PlaneGeometry(NAME_W, NAME_H),
        new THREE.MeshStandardMaterial({
          map: named.texture,
          roughness: 0.72,
          metalness: 0,
        }),
      );
      name.name = 'frame-nameplate';
      name.position.set(0, labelY, 0.004);
      frame.add(name);

      this.group.add(frame);
    });
  }

  applyPalette(palette: GalleryPalette): void {
    const warm = palette.id !== 'glacier';
    this.frameMat.color.set(warm ? 0xb08958 : palette.metal);
    this.frameMat.roughness = warm ? 0.42 : 0.22;
    this.frameMat.metalness = warm ? 0.7 : palette.metalness;
    this.frameMat.envMapIntensity = warm ? 0.85 : palette.metalEnv;
    this.sightMat.color.set(warm ? 0x7a5e3c : 0x8e9ba2);
    this.sightMat.roughness = warm ? 0.48 : 0.28;
    this.sightMat.metalness = warm ? 0.62 : 0.8;
    this.matMat.color.set(warm ? 0xf3ecdf : palette.mat);
    this.contactMat.color.set(palette.contact);
    for (const redraw of this.redrawLabels) redraw(warm ? 'warm' : 'glacier');
  }

  applyPaletteId(id: GalleryPaletteId): void {
    this.applyPalette(galleryPalette(id));
  }
}

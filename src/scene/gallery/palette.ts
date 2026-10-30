export type GalleryPaletteId = 'warm' | 'glacier';

export interface GalleryPalette {
  id: GalleryPaletteId;
  label: string;
  plaster: number;
  metal: number;
  metalRoughness: number;
  metalness: number;
  metalEnv: number;
  bezel: number;
  bezelRoughness: number;
  bezelMetalness: number;
  bezelEnv: number;
  stone: number;
  floor: number;
  floorBorder: number;
  joint: number;
  shadowGap: number;
  contact: number;
  oculus: number;
  oculusEmissive: number;
  oculusEmissiveIntensity: number;
  well: number;
  cove: number;
  coveEmissive: number;
  coveEmissiveIntensity: number;
  mat: number;
  tableStone: number;
  echoRoughness: number;
  ambient: number;
  ambientIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  key: number;
  keyIntensity: number;
  spot: number;
  spotIntensity: number;
  fill: number;
  fillIntensity: number;
  wash: number;
  washIntensity: number;
  envShell: number;
  envOculus: number;
  envCove: number;
  envFloor: number;
  envHemiSky: number;
  envHemiGround: number;
  envKey: number;
  envIntensity: number;
}

/**
 * 暖石灰：象牙纸和燕麦灰。圆环用暖石，不铺陶土。
 */
const WARM: GalleryPalette = {
  id: 'warm',
  label: '暖石灰',
  plaster: 0xe3dacc,
  metal: 0xa89f94,
  metalRoughness: 0.55,
  metalness: 0.28,
  metalEnv: 0.4,
  bezel: 0xb3a89c,
  bezelRoughness: 0.5,
  bezelMetalness: 0.26,
  bezelEnv: 0.35,
  stone: 0xd4cfc3,
  floor: 0xe3dacc,
  floorBorder: 0xb0aea5,
  joint: 0xa8a69e,
  shadowGap: 0x9c9a92,
  contact: 0x8a8880,
  oculus: 0xfaf9f5,
  oculusEmissive: 0xf5f3ee,
  oculusEmissiveIntensity: 0.32,
  well: 0xd9d6cc,
  cove: 0xf0eee6,
  coveEmissive: 0xe8e6dc,
  coveEmissiveIntensity: 0.22,
  mat: 0xf5e3c7,
  tableStone: 0xe3dacc,
  echoRoughness: 0.58,
  ambient: 0xfaf9f5,
  ambientIntensity: 0.3,
  hemiSky: 0xfaf9f5,
  hemiGround: 0xc4c0b4,
  hemiIntensity: 0.36,
  key: 0xf7f5f0,
  keyIntensity: 0.48,
  spot: 0xfaf9f5,
  spotIntensity: 4.8,
  fill: 0xe8e6dc,
  fillIntensity: 0.2,
  wash: 0xf5f3ee,
  washIntensity: 0.36,
  envShell: 0xe3dacc,
  envOculus: 0xfaf9f5,
  envCove: 0xf0eee6,
  envFloor: 0xd5d1c6,
  envHemiSky: 0xfaf9f5,
  envHemiGround: 0xc4c0b4,
  envKey: 0xf7f5f0,
  envIntensity: 0.46,
};

/** 霜青：同一套建筑，换成冷石灰、镜面银和偏冷的天光。 */
const GLACIER: GalleryPalette = {
  id: 'glacier',
  label: '霜青',
  plaster: 0xc5d0d6,
  metal: 0xb8c6d0,
  metalRoughness: 0.18,
  metalness: 0.96,
  metalEnv: 1.15,
  bezel: 0xd0dce4,
  bezelRoughness: 0.22,
  bezelMetalness: 0.82,
  bezelEnv: 0.85,
  stone: 0xb4c2c8,
  floor: 0xc9d6dc,
  floorBorder: 0x9aabb2,
  joint: 0x8a9ca4,
  shadowGap: 0x84969e,
  contact: 0x70848c,
  oculus: 0xe4eef4,
  oculusEmissive: 0xc5d6e0,
  oculusEmissiveIntensity: 0.48,
  well: 0xa8b6bc,
  cove: 0xdce8ee,
  coveEmissive: 0xc0d2dc,
  coveEmissiveIntensity: 0.3,
  mat: 0xd5e2e8,
  tableStone: 0xc5d4da,
  echoRoughness: 0.22,
  ambient: 0xe4eef2,
  ambientIntensity: 0.26,
  hemiSky: 0xe6f0f6,
  hemiGround: 0xa4b4ba,
  hemiIntensity: 0.36,
  key: 0xe8f2f8,
  keyIntensity: 0.55,
  spot: 0xe4eef6,
  spotIntensity: 7.2,
  fill: 0xd0dee4,
  fillIntensity: 0.22,
  wash: 0xe2eef2,
  washIntensity: 0.4,
  envShell: 0xb0c0c6,
  envOculus: 0xdceaf2,
  envCove: 0xc8d8e0,
  envFloor: 0xa8b8be,
  envHemiSky: 0xe4eef4,
  envHemiGround: 0xa4b4ba,
  envKey: 0xdceaf0,
  envIntensity: 0.5,
};

export const GALLERY_PALETTES: Record<GalleryPaletteId, GalleryPalette> = {
  warm: WARM,
  glacier: GLACIER,
};

export function galleryPalette(id: string | undefined): GalleryPalette {
  if (id === 'glacier') return GLACIER;
  return WARM;
}

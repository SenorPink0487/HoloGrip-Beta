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

/** 暖石灰：实验室现有配色。灰泥、香槟铜、暖白顶光。 */
const WARM: GalleryPalette = {
  id: 'warm',
  label: '暖石灰',
  plaster: 0xf4f1ea,
  metal: 0xc6a56e,
  metalRoughness: 0.3,
  metalness: 0.9,
  metalEnv: 1.05,
  bezel: 0xd7b56a,
  bezelRoughness: 0.32,
  bezelMetalness: 0.42,
  bezelEnv: 0.55,
  stone: 0xe7e0d4,
  floor: 0xffffff,
  floorBorder: 0xcfc6b8,
  joint: 0xc9c1b4,
  shadowGap: 0xc9c2b6,
  contact: 0xb7aea0,
  oculus: 0xfff8f1,
  oculusEmissive: 0xfff3e6,
  oculusEmissiveIntensity: 0.95,
  well: 0xddd6cc,
  cove: 0xfff6ee,
  coveEmissive: 0xfff1e4,
  coveEmissiveIntensity: 0.62,
  mat: 0xf7f3ea,
  tableStone: 0xf3efe6,
  echoRoughness: 0.4,
  ambient: 0xf7f3eb,
  ambientIntensity: 0.34,
  hemiSky: 0xfff8f1,
  hemiGround: 0xd5cec2,
  hemiIntensity: 0.42,
  key: 0xfff6ee,
  keyIntensity: 0.72,
  spot: 0xfff4e8,
  spotIntensity: 9.5,
  fill: 0xf4efe6,
  fillIntensity: 0.28,
  wash: 0xfff7ef,
  washIntensity: 0.55,
  envShell: 0xe6e0d4,
  envOculus: 0xfff6ec,
  envCove: 0xfff3e6,
  envFloor: 0xd9d2c4,
  envHemiSky: 0xfff8f1,
  envHemiGround: 0xd5cec2,
  envKey: 0xfff6ec,
  envIntensity: 0.58,
};

/** 霜青：同一套建筑，换成冷石灰、镜面银和偏冷的天光。 */
const GLACIER: GalleryPalette = {
  id: 'glacier',
  label: '霜青',
  plaster: 0xe4ebed,
  metal: 0xd5dee6,
  metalRoughness: 0.16,
  metalness: 0.96,
  metalEnv: 1.2,
  bezel: 0xe7eef3,
  bezelRoughness: 0.2,
  bezelMetalness: 0.78,
  bezelEnv: 0.9,
  stone: 0xd5e0e4,
  floor: 0xe7eef2,
  floorBorder: 0xc3cdd2,
  joint: 0xb3c0c6,
  shadowGap: 0xb7c3c8,
  contact: 0x9eafb5,
  oculus: 0xf7fbfe,
  oculusEmissive: 0xe5f0f6,
  oculusEmissiveIntensity: 0.88,
  well: 0xc5d0d5,
  cove: 0xf3f8fa,
  coveEmissive: 0xe3eef3,
  coveEmissiveIntensity: 0.5,
  mat: 0xeef3f5,
  tableStone: 0xeef3f4,
  echoRoughness: 0.2,
  ambient: 0xf3f7f8,
  ambientIntensity: 0.36,
  hemiSky: 0xf5fafc,
  hemiGround: 0xc5d0d4,
  hemiIntensity: 0.46,
  key: 0xf2f7fb,
  keyIntensity: 0.76,
  spot: 0xf4f8fc,
  spotIntensity: 9.2,
  fill: 0xe6eef2,
  fillIntensity: 0.32,
  wash: 0xf4f9fb,
  washIntensity: 0.6,
  envShell: 0xd4dee3,
  envOculus: 0xf3f8fc,
  envCove: 0xe6f0f5,
  envFloor: 0xc7d2d7,
  envHemiSky: 0xf3f8fb,
  envHemiGround: 0xc5d0d4,
  envKey: 0xf1f6fa,
  envIntensity: 0.64,
};

export const GALLERY_PALETTES: Record<GalleryPaletteId, GalleryPalette> = {
  warm: WARM,
  glacier: GLACIER,
};

export function galleryPalette(id: string | undefined): GalleryPalette {
  if (id === 'glacier') return GLACIER;
  return WARM;
}

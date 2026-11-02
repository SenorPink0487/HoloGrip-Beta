/**
 * 分子与晶体三维空间结构解析引擎 (3D Molecular & Crystal Structure Engine)
 *
 * 为全息烧杯成分卡片提供精准的 VSEPR 共价分子构型、多原子酸根配位盐构型、
 * 面心立方岩盐晶胞 (NaCl 型)、金属单质晶胞 (BCC / FCC / HCP) 以及有机分子三维构象。
 * 同时内置通用化学式递归解析与 VSEPR 自动构图回退算法，确保任意化学物质均可呈现严谨三维结构。
 */

export type BondKind = 'single' | 'double' | 'triple' | 'aromatic' | 'ionic' | 'metallic';

export interface ElementVisualSpec {
  symbol: string;
  zhName: string;
  color: number;
  emissive: number;
  radius: number;
  metalness: number;
  roughness: number;
  valence: number;
}

export interface AtomNode {
  id: string;
  element: string;
  badge: string;
  position: [number, number, number];
  charge?: number;
}

export interface BondEdge {
  a: number;
  b: number;
  kind: BondKind;
}

export interface MolecularStructureDef {
  key: string;
  formula: string;
  name: string;
  structureType: 'covalent' | 'ionic-lattice' | 'polyatomic-salt' | 'metallic-lattice' | 'ion';
  geometryLabel: string;
  atoms: AtomNode[];
  bonds: BondEdge[];
  unitCellBox?: [number, number, number];
  orbitalRings?: number;
}

/**
 * 遵循实验室高规格物理材质规范的元素视觉参数表（杜绝沉闷纯黑材质，碳采用航天缎面铂钛灰银）
 */
export const ELEMENT_SPECS: Record<string, ElementVisualSpec> = {
  H:  { symbol: 'H',  zhName: '氢', color: 0xf8fafc, emissive: 0x94a3b8, radius: 0.33, metalness: 0.08, roughness: 0.20, valence: 1 },
  He: { symbol: 'He', zhName: '氦', color: 0xa5f3fc, emissive: 0x22d3ee, radius: 0.36, metalness: 0.10, roughness: 0.18, valence: 0 },
  Li: { symbol: 'Li', zhName: '锂', color: 0xc084fc, emissive: 0x7e22ce, radius: 0.52, metalness: 0.65, roughness: 0.25, valence: 1 },
  Be: { symbol: 'Be', zhName: '铍', color: 0xa7f3d0, emissive: 0x10b981, radius: 0.48, metalness: 0.65, roughness: 0.25, valence: 2 },
  B:  { symbol: 'B',  zhName: '硼', color: 0xfda4af, emissive: 0xf43f5e, radius: 0.48, metalness: 0.35, roughness: 0.25, valence: 3 },
  C:  { symbol: 'C',  zhName: '碳', color: 0x7c8ea6, emissive: 0x1e293b, radius: 0.50, metalness: 0.45, roughness: 0.30, valence: 4 },
  N:  { symbol: 'N',  zhName: '氮', color: 0x2563eb, emissive: 0x1e40af, radius: 0.48, metalness: 0.15, roughness: 0.25, valence: 3 },
  O:  { symbol: 'O',  zhName: '氧', color: 0xef4444, emissive: 0x7f1d1d, radius: 0.47, metalness: 0.12, roughness: 0.25, valence: 2 },
  F:  { symbol: 'F',  zhName: '氟', color: 0x34d399, emissive: 0x059669, radius: 0.44, metalness: 0.15, roughness: 0.25, valence: 1 },
  Ne: { symbol: 'Ne', zhName: '氖', color: 0xfb7185, emissive: 0xf43f5e, radius: 0.45, metalness: 0.12, roughness: 0.20, valence: 0 },
  Na: { symbol: 'Na', zhName: '钠', color: 0x8b5cf6, emissive: 0x6d28d9, radius: 0.56, metalness: 0.65, roughness: 0.25, valence: 1 },
  Mg: { symbol: 'Mg', zhName: '镁', color: 0xe2e8f0, emissive: 0x94a3b8, radius: 0.56, metalness: 0.80, roughness: 0.20, valence: 2 },
  Al: { symbol: 'Al', zhName: '铝', color: 0xf1f5f9, emissive: 0x94a3b8, radius: 0.56, metalness: 0.85, roughness: 0.18, valence: 3 },
  Si: { symbol: 'Si', zhName: '硅', color: 0x93c5fd, emissive: 0x2563eb, radius: 0.54, metalness: 0.50, roughness: 0.25, valence: 4 },
  P:  { symbol: 'P',  zhName: '磷', color: 0xf97316, emissive: 0xc2410c, radius: 0.55, metalness: 0.20, roughness: 0.25, valence: 5 },
  S:  { symbol: 'S',  zhName: '硫', color: 0xf59e0b, emissive: 0xd97706, radius: 0.56, metalness: 0.22, roughness: 0.25, valence: 6 },
  Cl: { symbol: 'Cl', zhName: '氯', color: 0x16a34a, emissive: 0x14532d, radius: 0.57, metalness: 0.15, roughness: 0.25, valence: 1 },
  Ar: { symbol: 'Ar', zhName: '氩', color: 0x67e8f9, emissive: 0x0891b2, radius: 0.52, metalness: 0.12, roughness: 0.20, valence: 0 },
  K:  { symbol: 'K',  zhName: '钾', color: 0xa855f7, emissive: 0x6b21a8, radius: 0.62, metalness: 0.65, roughness: 0.25, valence: 1 },
  Ca: { symbol: 'Ca', zhName: '钙', color: 0xe2e8f0, emissive: 0x64748b, radius: 0.60, metalness: 0.75, roughness: 0.22, valence: 2 },
  Mn: { symbol: 'Mn', zhName: '锰', color: 0x9333ea, emissive: 0x581c87, radius: 0.58, metalness: 0.75, roughness: 0.22, valence: 7 },
  Fe: { symbol: 'Fe', zhName: '铁', color: 0xcbd5e1, emissive: 0x64748b, radius: 0.58, metalness: 0.85, roughness: 0.20, valence: 3 },
  Cu: { symbol: 'Cu', zhName: '铜', color: 0xe07a3c, emissive: 0x9a3412, radius: 0.58, metalness: 0.88, roughness: 0.18, valence: 2 },
  Zn: { symbol: 'Zn', zhName: '锌', color: 0xdbeafe, emissive: 0x64748b, radius: 0.57, metalness: 0.80, roughness: 0.20, valence: 2 },
  Br: { symbol: 'Br', zhName: '溴', color: 0xd97706, emissive: 0x92400e, radius: 0.60, metalness: 0.30, roughness: 0.25, valence: 1 },
  Ag: { symbol: 'Ag', zhName: '银', color: 0xffffff, emissive: 0x94a3b8, radius: 0.61, metalness: 0.95, roughness: 0.10, valence: 1 },
  I:  { symbol: 'I',  zhName: '碘', color: 0x8b5cf6, emissive: 0x4c1d95, radius: 0.64, metalness: 0.28, roughness: 0.25, valence: 1 },
  Ba: { symbol: 'Ba', zhName: '钡', color: 0xc084fc, emissive: 0x6d28d9, radius: 0.65, metalness: 0.75, roughness: 0.22, valence: 2 },
};

const DEFAULT_ELEMENT_SPEC: ElementVisualSpec = {
  symbol: 'X',
  zhName: '原子',
  color: 0x94a3b8,
  emissive: 0x38bdf8,
  radius: 0.52,
  metalness: 0.65,
  roughness: 0.22,
  valence: 2,
};

export function getElementSpec(element: string): ElementVisualSpec {
  const clean = element.replace(/[^A-Za-z]/g, '');
  const formatted = clean ? clean[0].toUpperCase() + clean.slice(1).toLowerCase() : 'X';
  return ELEMENT_SPECS[formatted] ?? { ...DEFAULT_ELEMENT_SPEC, symbol: formatted };
}

const SUBSCRIPT_TO_ASCII: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '＋': '+', '−': '-',
};

/**
 * 归一化化学式键名，去除气体/沉淀箭头、相态后缀及上下标符号差异
 */
export function normalizeChemicalKey(rawFormula: string): string {
  if (!rawFormula) return '';
  let s = rawFormula.trim();
  s = s.replace(/\((aq|s|l|g)\)/gi, '');
  s = s.replace(/[↑↓]/g, '');
  s = s.replace(/[₀-₉⁰-⁹⁺⁻＋−]/g, (ch) => SUBSCRIPT_TO_ASCII[ch] ?? ch);
  s = s.replace(/\s+/g, '');
  s = s.replace(/[（]/g, '(').replace(/[）]/g, ')');
  return s;
}

class StructureBuilder {
  public atoms: AtomNode[] = [];
  public bonds: BondEdge[] = [];

  public addAtom(
    element: string,
    x: number,
    y: number,
    z: number,
    badge?: string,
    charge?: number
  ): number {
    const idx = this.atoms.length;
    this.atoms.push({
      id: `${element}_${idx}`,
      element,
      badge: badge ?? element,
      position: [x, y, z],
      charge,
    });
    return idx;
  }

  public addBond(a: number, b: number, kind: BondKind = 'single'): void {
    if (a === b || a < 0 || b < 0 || a >= this.atoms.length || b >= this.atoms.length) return;
    const exists = this.bonds.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    if (!exists) {
      this.bonds.push({ a, b, kind });
    }
  }
}

// ============================================================================
// 复用结构基元构建器：晶胞、多原子酸根与配位基团
// ============================================================================

/**
 * 构建 2x2x2 面心立方岩盐型 (NaCl-type) 离子晶格八分体单元
 */
function buildRocksaltLattice(
  key: string,
  formula: string,
  name: string,
  cation: string,
  cationBadge: string,
  anion: string,
  anionBadge: string,
  halfSpacing = 0.96
): MolecularStructureDef {
  const b = new StructureBuilder();
  const grid: number[][][] = [
    [[0, 0], [0, 0]],
    [[0, 0], [0, 0]],
  ];

  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        const x = (ix === 0 ? -1 : 1) * halfSpacing;
        const y = (iy === 0 ? -1 : 1) * halfSpacing;
        const z = (iz === 0 ? -1 : 1) * halfSpacing;
        const isCation = (ix + iy + iz) % 2 === 0;
        grid[ix][iy][iz] = isCation
          ? b.addAtom(cation, x, y, z, cationBadge, 1)
          : b.addAtom(anion, x, y, z, anionBadge, -1);
      }
    }
  }

  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        const u = grid[ix][iy][iz];
        if (ix + 1 < 2) b.addBond(u, grid[ix + 1][iy][iz], 'ionic');
        if (iy + 1 < 2) b.addBond(u, grid[ix][iy + 1][iz], 'ionic');
        if (iz + 1 < 2) b.addBond(u, grid[ix][iy][iz + 1], 'ionic');
      }
    }
  }

  const side = halfSpacing * 2;
  return {
    key,
    formula,
    name,
    structureType: 'ionic-lattice',
    geometryLabel: '立方岩盐晶格单元 (Octahedral 90°)',
    atoms: b.atoms,
    bonds: b.bonds,
    unitCellBox: [side, side, side],
  };
}

/**
 * 构建体心立方 (BCC) 金属晶胞（如 Fe、Na）
 */
function buildBCCMetalLattice(
  element: string,
  name: string,
  halfSide = 1.05
): MolecularStructureDef {
  const b = new StructureBuilder();
  const center = b.addAtom(element, 0, 0, 0, element, 0);
  const corners: number[] = [];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const c = b.addAtom(element, sx * halfSide, sy * halfSide, sz * halfSide, element, 0);
        corners.push(c);
        b.addBond(center, c, 'metallic');
      }
    }
  }

  const side = halfSide * 2;
  return {
    key: element,
    formula: element,
    name,
    structureType: 'metallic-lattice',
    geometryLabel: '体心立方金属晶胞 (BCC)',
    atoms: b.atoms,
    bonds: b.bonds,
    unitCellBox: [side, side, side],
  };
}

/**
 * 构建面心立方 (FCC) 金属晶胞（如 Cu、Al、Ag）
 */
function buildFCCMetalLattice(
  element: string,
  name: string,
  halfSide = 1.18
): MolecularStructureDef {
  const b = new StructureBuilder();
  const corners: Array<{ idx: number; p: [number, number, number] }> = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p: [number, number, number] = [sx * halfSide, sy * halfSide, sz * halfSide];
        corners.push({ idx: b.addAtom(element, p[0], p[1], p[2], element, 0), p });
      }
    }
  }

  const faceCoords: Array<[number, number, number]> = [
    [halfSide, 0, 0], [-halfSide, 0, 0],
    [0, halfSide, 0], [0, -halfSide, 0],
    [0, 0, halfSide], [0, 0, -halfSide],
  ];
  for (const fp of faceCoords) {
    const fIdx = b.addAtom(element, fp[0], fp[1], fp[2], element, 0);
    for (const c of corners) {
      const distSq = (c.p[0] - fp[0]) ** 2 + (c.p[1] - fp[1]) ** 2 + (c.p[2] - fp[2]) ** 2;
      if (Math.abs(distSq - 2 * halfSide * halfSide) < 0.05) {
        b.addBond(fIdx, c.idx, 'metallic');
      }
    }
  }

  const side = halfSide * 2;
  return {
    key: element,
    formula: element,
    name,
    structureType: 'metallic-lattice',
    geometryLabel: '面心立方金属晶胞 (FCC)',
    atoms: b.atoms,
    bonds: b.bonds,
    unitCellBox: [side, side, side],
  };
}

/**
 * 构建密排六方 (HCP) 金属晶胞（如 Mg、Zn）
 */
function buildHCPMetalLattice(
  element: string,
  name: string,
  radius = 1.12,
  halfHeight = 0.92
): MolecularStructureDef {
  const b = new StructureBuilder();
  const topRing: number[] = [];
  const botRing: number[] = [];

  const topCenter = b.addAtom(element, 0, halfHeight, 0, element, 0);
  const botCenter = b.addAtom(element, 0, -halfHeight, 0, element, 0);

  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    topRing.push(b.addAtom(element, x, halfHeight, z, element, 0));
    botRing.push(b.addAtom(element, x, -halfHeight, z, element, 0));
  }

  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    b.addBond(topRing[i], topRing[next], 'metallic');
    b.addBond(botRing[i], botRing[next], 'metallic');
    b.addBond(topCenter, topRing[i], 'metallic');
    b.addBond(botCenter, botRing[i], 'metallic');
    b.addBond(topRing[i], botRing[i], 'metallic');
  }

  // ABAB 中间层 3 个配位原子
  const midRadius = radius * 0.58;
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 6;
    const mIdx = b.addAtom(element, Math.cos(a) * midRadius, 0, Math.sin(a) * midRadius, element, 0);
    b.addBond(mIdx, topCenter, 'metallic');
    b.addBond(mIdx, botCenter, 'metallic');
  }

  return {
    key: element,
    formula: element,
    name,
    structureType: 'metallic-lattice',
    geometryLabel: '密排六方金属晶胞 (HCP)',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

/**
 * 构建二价硫酸盐 MSO4（正四面体 SO4²⁻ 与 M²⁺ 双齿螯合配位）
 */
function buildDivalentSulfate(
  key: string,
  formula: string,
  name: string,
  metal: string,
  metalBadge: string
): MolecularStructureDef {
  const b = new StructureBuilder();
  const s = b.addAtom('S', -0.42, 0, 0, 'S', 6);
  // 左侧两个端基双键氧 =O
  const oTerm1 = b.addAtom('O', -1.24, 0.96, 0, 'O', -2);
  const oTerm2 = b.addAtom('O', -1.24, -0.96, 0, 'O', -2);
  // 右侧两个桥联配位氧 -O⁻
  const oBridge1 = b.addAtom('O', 0.42, 0, 0.96, 'O', -2);
  const oBridge2 = b.addAtom('O', 0.42, 0, -0.96, 'O', -2);
  // 右侧金属阳离子 M²⁺
  const m = b.addAtom(metal, 1.56, 0, 0, metalBadge, 2);

  b.addBond(s, oTerm1, 'double');
  b.addBond(s, oTerm2, 'double');
  b.addBond(s, oBridge1, 'single');
  b.addBond(s, oBridge2, 'single');
  b.addBond(m, oBridge1, 'ionic');
  b.addBond(m, oBridge2, 'ionic');

  return {
    key,
    formula,
    name,
    structureType: 'polyatomic-salt',
    geometryLabel: '正四面体硫酸根双齿配位构型',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

/**
 * 构建一价碱金属硫酸盐 M2SO4
 */
function buildMonovalentSulfate(
  key: string,
  formula: string,
  name: string,
  metal: string,
  metalBadge: string
): MolecularStructureDef {
  const b = new StructureBuilder();
  const s = b.addAtom('S', 0, 0, 0, 'S', 6);
  const oL1 = b.addAtom('O', -0.82, 0.95, 0, 'O', -2);
  const oL2 = b.addAtom('O', -0.82, -0.95, 0, 'O', -2);
  const oR1 = b.addAtom('O', 0.82, 0, 0.95, 'O', -2);
  const oR2 = b.addAtom('O', 0.82, 0, -0.95, 'O', -2);

  const mLeft = b.addAtom(metal, -1.96, 0, 0, metalBadge, 1);
  const mRight = b.addAtom(metal, 1.96, 0, 0, metalBadge, 1);

  b.addBond(s, oL1, 'double');
  b.addBond(s, oR1, 'double');
  b.addBond(s, oL2, 'single');
  b.addBond(s, oR2, 'single');

  b.addBond(mLeft, oL1, 'ionic');
  b.addBond(mLeft, oL2, 'ionic');
  b.addBond(mRight, oR1, 'ionic');
  b.addBond(mRight, oR2, 'ionic');

  return {
    key,
    formula,
    name,
    structureType: 'polyatomic-salt',
    geometryLabel: '正四面体硫酸根双阳离子配位构型',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

/**
 * 构建三价金属硫酸盐 M2(SO4)3（三维三桥笼状灯笼构型）
 */
function buildTrivalentSulfate(
  key: string,
  formula: string,
  name: string,
  metal: string,
  metalBadge: string
): MolecularStructureDef {
  const b = new StructureBuilder();
  const mLeft = b.addAtom(metal, -1.68, 0, 0, metalBadge, 3);
  const mRight = b.addAtom(metal, 1.68, 0, 0, metalBadge, 3);

  for (let i = 0; i < 3; i++) {
    const phi = (i * 2 * Math.PI) / 3;
    const cy = Math.cos(phi);
    const cz = Math.sin(phi);
    const rCenter = 1.48;

    const s = b.addAtom('S', 0, cy * rCenter, cz * rCenter, 'S', 6);
    const oBridgeL = b.addAtom('O', -0.88, cy * 1.02, cz * 1.02, 'O', -2);
    const oBridgeR = b.addAtom('O', 0.88, cy * 1.02, cz * 1.02, 'O', -2);

    const tx = 0;
    const ty = -cz * 0.68 + cy * 2.18;
    const tz = cy * 0.68 + cz * 2.18;
    const ty2 = cz * 0.68 + cy * 2.18;
    const tz2 = -cy * 0.68 + cz * 2.18;

    const oTerm1 = b.addAtom('O', tx, ty, tz, 'O', -2);
    const oTerm2 = b.addAtom('O', tx, ty2, tz2, 'O', -2);

    b.addBond(s, oBridgeL, 'single');
    b.addBond(s, oBridgeR, 'single');
    b.addBond(s, oTerm1, 'double');
    b.addBond(s, oTerm2, 'double');
    b.addBond(mLeft, oBridgeL, 'ionic');
    b.addBond(mRight, oBridgeR, 'ionic');
  }

  return {
    key,
    formula,
    name,
    structureType: 'polyatomic-salt',
    geometryLabel: '三硫酸根桥联双核笼状配位构型',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

/**
 * 构建硝酸盐 M(NO3)n（n = 1, 2, 3）
 */
function buildNitrateSalt(
  key: string,
  formula: string,
  name: string,
  metal: string,
  metalBadge: string,
  count: 1 | 2 | 3
): MolecularStructureDef {
  const b = new StructureBuilder();

  if (count === 1) {
    const n = b.addAtom('N', -0.45, 0, 0, 'N', 5);
    const oTerm = b.addAtom('O', -1.58, 0, 0, 'O', -2);
    const oB1 = b.addAtom('O', 0.22, 0.98, 0, 'O', -2);
    const oB2 = b.addAtom('O', 0.22, -0.98, 0, 'O', -2);
    const m = b.addAtom(metal, 1.52, 0, 0, metalBadge, 1);

    b.addBond(n, oTerm, 'double');
    b.addBond(n, oB1, 'single');
    b.addBond(n, oB2, 'single');
    b.addBond(m, oB1, 'ionic');
    b.addBond(m, oB2, 'ionic');
  } else if (count === 2) {
    const m = b.addAtom(metal, 0, 0, 0, metalBadge, 2);
    for (const side of [-1, 1] as const) {
      const n = b.addAtom('N', side * 1.92, 0, 0, 'N', 5);
      const oTerm = b.addAtom('O', side * 3.02, 0, 0, 'O', -2);
      const oB1 = b.addAtom('O', side * 1.24, side > 0 ? 0.92 : 0, side > 0 ? 0 : 0.92, 'O', -2);
      const oB2 = b.addAtom('O', side * 1.24, side > 0 ? -0.92 : 0, side > 0 ? 0 : -0.92, 'O', -2);

      b.addBond(n, oTerm, 'double');
      b.addBond(n, oB1, 'single');
      b.addBond(n, oB2, 'single');
      b.addBond(m, oB1, 'ionic');
      b.addBond(m, oB2, 'ionic');
    }
  } else {
    const m = b.addAtom(metal, 0, 0, 0, metalBadge, 3);
    for (let i = 0; i < 3; i++) {
      const ang = (i * 2 * Math.PI) / 3;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const n = b.addAtom('N', dx * 1.96, 0, dz * 1.96, 'N', 5);
      const oTerm = b.addAtom('O', dx * 3.06, 0, dz * 3.06, 'O', -2);
      const oB1 = b.addAtom('O', dx * 1.26 - dz * 0.45, 0.78, dz * 1.26 + dx * 0.45, 'O', -2);
      const oB2 = b.addAtom('O', dx * 1.26 + dz * 0.45, -0.78, dz * 1.26 - dx * 0.45, 'O', -2);

      b.addBond(n, oTerm, 'double');
      b.addBond(n, oB1, 'single');
      b.addBond(n, oB2, 'single');
      b.addBond(m, oB1, 'ionic');
      b.addBond(m, oB2, 'ionic');
    }
  }

  return {
    key,
    formula,
    name,
    structureType: 'polyatomic-salt',
    geometryLabel: '平面三角形硝酸根配位构型',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

/**
 * 构建二元金属卤化物 MCl2 / MCl3
 */
function buildMetalHalide(
  key: string,
  formula: string,
  name: string,
  metal: string,
  metalBadge: string,
  halogen: string,
  halogenBadge: string,
  count: 2 | 3
): MolecularStructureDef {
  const b = new StructureBuilder();
  if (count === 2) {
    const m = b.addAtom(metal, 0, 0.26, 0, metalBadge, 2);
    const x1 = b.addAtom(halogen, -1.42, -0.24, 0, halogenBadge, -1);
    const x2 = b.addAtom(halogen, 1.42, -0.24, 0, halogenBadge, -1);
    b.addBond(m, x1, 'ionic');
    b.addBond(m, x2, 'ionic');
    return {
      key,
      formula,
      name,
      structureType: 'polyatomic-salt',
      geometryLabel: '二配位离子键合单元',
      atoms: b.atoms,
      bonds: b.bonds,
    };
  }
  const m = b.addAtom(metal, 0, 0, 0, metalBadge, 3);
  for (let i = 0; i < 3; i++) {
    const ang = (i * 2 * Math.PI) / 3 - Math.PI / 2;
    const xIdx = b.addAtom(halogen, Math.cos(ang) * 1.54, Math.sin(ang) * 1.54, 0, halogenBadge, -1);
    b.addBond(m, xIdx, 'ionic');
  }
  return {
    key,
    formula,
    name,
    structureType: 'polyatomic-salt',
    geometryLabel: '平面三角形三配位构型 (120°)',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

/**
 * 构建金属氢氧化物 M(OH)n（n = 1, 2, 3）
 */
function buildHydroxide(
  key: string,
  formula: string,
  name: string,
  metal: string,
  metalBadge: string,
  count: 1 | 2 | 3
): MolecularStructureDef {
  const b = new StructureBuilder();
  if (count === 1) {
    const m = b.addAtom(metal, -1.22, 0, 0, metalBadge, 1);
    const o = b.addAtom('O', 0.34, 0.14, 0, 'O', -2);
    const h = b.addAtom('H', 1.24, -0.34, 0, 'H', 1);
    b.addBond(m, o, 'ionic');
    b.addBond(o, h, 'single');
  } else if (count === 2) {
    const m = b.addAtom(metal, 0, 0, 0, metalBadge, 2);
    const o1 = b.addAtom('O', -1.38, 0.16, 0, 'O', -2);
    const h1 = b.addAtom('H', -2.02, -0.44, 0.32, 'H', 1);
    const o2 = b.addAtom('O', 1.38, -0.16, 0, 'O', -2);
    const h2 = b.addAtom('H', 2.02, 0.44, -0.32, 'H', 1);
    b.addBond(m, o1, 'ionic');
    b.addBond(o1, h1, 'single');
    b.addBond(m, o2, 'ionic');
    b.addBond(o2, h2, 'single');
  } else {
    const m = b.addAtom(metal, 0, 0.24, 0, metalBadge, 3);
    for (let i = 0; i < 3; i++) {
      const ang = (i * 2 * Math.PI) / 3;
      const ox = Math.cos(ang) * 1.38;
      const oz = Math.sin(ang) * 1.38;
      const o = b.addAtom('O', ox, -0.18, oz, 'O', -2);
      const h = b.addAtom('H', ox * 1.48, -0.68, oz * 1.48, 'H', 1);
      b.addBond(m, o, 'ionic');
      b.addBond(o, h, 'single');
    }
  }

  return {
    key,
    formula,
    name,
    structureType: 'polyatomic-salt',
    geometryLabel: '氢氧根配位结构',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

// ============================================================================
// 精确有机与生物大分子三维构象构建器
// ============================================================================

function buildGlucose(): MolecularStructureDef {
  // α-D-吡喃葡萄糖椅式构象 (Chair Conformation)
  const b = new StructureBuilder();
  const c1 = b.addAtom('C', 1.28, -0.22, 0.42);
  const c2 = b.addAtom('C', 0.68, 0.25, 1.68);
  const c3 = b.addAtom('C', -0.78, -0.18, 1.72);
  const c4 = b.addAtom('C', -1.42, 0.26, 0.42);
  const c5 = b.addAtom('C', -0.72, -0.22, -0.82);
  const o5 = b.addAtom('O', 0.68, 0.22, -0.76);

  b.addBond(c1, c2, 'single');
  b.addBond(c2, c3, 'single');
  b.addBond(c3, c4, 'single');
  b.addBond(c4, c5, 'single');
  b.addBond(c5, o5, 'single');
  b.addBond(o5, c1, 'single');

  // 环外羟基与羟甲基 (-CH2OH)
  const o1 = b.addAtom('O', 2.48, 0.18, 0.36);
  const h1o = b.addAtom('H', 2.98, -0.12, 1.08);
  b.addBond(c1, o1, 'single');
  b.addBond(o1, h1o, 'single');

  const o2 = b.addAtom('O', 1.32, -0.18, 2.82);
  const h2o = b.addAtom('H', 2.15, 0.22, 2.95);
  b.addBond(c2, o2, 'single');
  b.addBond(o2, h2o, 'single');

  const o3 = b.addAtom('O', -1.36, 0.24, 2.88);
  const h3o = b.addAtom('H', -2.22, -0.12, 2.96);
  b.addBond(c3, o3, 'single');
  b.addBond(o3, h3o, 'single');

  const o4 = b.addAtom('O', -2.74, -0.14, 0.42);
  const h4o = b.addAtom('H', -3.22, 0.28, -0.26);
  b.addBond(c4, o4, 'single');
  b.addBond(o4, h4o, 'single');

  const c6 = b.addAtom('C', -1.32, 0.24, -2.08);
  const o6 = b.addAtom('O', -0.68, -0.22, -3.22);
  const h6o = b.addAtom('H', -1.16, 0.08, -3.96);
  b.addBond(c5, c6, 'single');
  b.addBond(c6, o6, 'single');
  b.addBond(o6, h6o, 'single');

  // 环上直立键 C-H
  b.addBond(c1, b.addAtom('H', 1.24, -1.24, 0.42), 'single');
  b.addBond(c2, b.addAtom('H', 0.72, 1.28, 1.68), 'single');
  b.addBond(c3, b.addAtom('H', -0.82, -1.20, 1.72), 'single');
  b.addBond(c4, b.addAtom('H', -1.38, 1.28, 0.42), 'single');
  b.addBond(c5, b.addAtom('H', -0.76, -1.24, -0.82), 'single');
  b.addBond(c6, b.addAtom('H', -2.32, -0.12, -2.12), 'single');
  b.addBond(c6, b.addAtom('H', -1.34, 1.28, -2.08), 'single');

  return {
    key: 'C6H12O6',
    formula: 'C₆H₁₂O₆',
    name: '葡萄糖',
    structureType: 'covalent',
    geometryLabel: '六元吡喃环椅式三维构象 (Chair)',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

function buildCaffeine(): MolecularStructureDef {
  // 咖啡因 C8H10N4O2（嘌呤/黄嘌呤稠合 6+5 双环构型）
  const b = new StructureBuilder();
  // 六元嘧啶二酮环
  const n1 = b.addAtom('N', -1.38, 0.78, 0);
  const c2 = b.addAtom('C', -1.38, -0.62, 0);
  const n3 = b.addAtom('N', -0.16, -1.32, 0);
  const c4 = b.addAtom('C', 1.02, -0.62, 0);
  const c5 = b.addAtom('C', 1.02, 0.78, 0);
  const c6 = b.addAtom('C', -0.18, 1.48, 0);

  b.addBond(n1, c2, 'single');
  b.addBond(c2, n3, 'single');
  b.addBond(n3, c4, 'single');
  b.addBond(c4, c5, 'double');
  b.addBond(c5, c6, 'single');
  b.addBond(c6, n1, 'single');

  // 五元咪唑稠环
  const n7 = b.addAtom('N', 2.28, 1.22, 0);
  const c8 = b.addAtom('C', 3.04, 0.08, 0);
  const n9 = b.addAtom('N', 2.28, -1.04, 0);
  b.addBond(c5, n7, 'single');
  b.addBond(n7, c8, 'single');
  b.addBond(c8, n9, 'double');
  b.addBond(n9, c4, 'single');

  // 两个羰基氧 =O
  const o2 = b.addAtom('O', -2.44, -1.24, 0);
  const o6 = b.addAtom('O', -0.18, 2.70, 0);
  b.addBond(c2, o2, 'double');
  b.addBond(c6, o6, 'double');

  // C8-H
  b.addBond(c8, b.addAtom('H', 4.06, 0.08, 0), 'single');

  // 三个甲基 -CH3 (在 N1, N3, N7 上呈正四面体三维延展)
  const addMethyl = (parentIdx: number, cx: number, cy: number, dirAngle: number) => {
    const mc = b.addAtom('C', cx, cy, 0);
    b.addBond(parentIdx, mc, 'single');
    const r = 0.92;
    b.addBond(mc, b.addAtom('H', cx + Math.cos(dirAngle) * r * 0.7, cy + Math.sin(dirAngle) * r * 0.7, 0.78), 'single');
    b.addBond(mc, b.addAtom('H', cx + Math.cos(dirAngle) * r * 0.7, cy + Math.sin(dirAngle) * r * 0.7, -0.78), 'single');
    b.addBond(mc, b.addAtom('H', cx + Math.cos(dirAngle + 1.2) * r, cy + Math.sin(dirAngle + 1.2) * r, 0), 'single');
  };

  addMethyl(n1, -2.62, 1.54, 2.5);
  addMethyl(n3, -0.16, -2.76, -1.57);
  addMethyl(n7, 2.68, 2.60, 1.15);

  return {
    key: 'C8H10N4O2',
    formula: 'C₈H₁₀N₄O₂',
    name: '咖啡因',
    structureType: 'covalent',
    geometryLabel: '黄嘌呤稠合双环共轭构型',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

function buildCitricAcid(): MolecularStructureDef {
  // 柠檬酸 C6H8O7：HOOC-CH2-C(OH)(COOH)-CH2-COOH
  const b = new StructureBuilder();
  const cCenter = b.addAtom('C', 0, 0, 0);
  const cLeft = b.addAtom('C', -1.46, -0.36, 0.22);
  const cRight = b.addAtom('C', 1.46, -0.36, -0.22);
  b.addBond(cCenter, cLeft, 'single');
  b.addBond(cCenter, cRight, 'single');

  // 中央羟基 -OH
  const oMid = b.addAtom('O', 0, -0.68, -1.26);
  b.addBond(cCenter, oMid, 'single');
  b.addBond(oMid, b.addAtom('H', 0.56, -1.42, -1.28), 'single');

  // 中央羧基 -COOH
  const cTop = b.addAtom('C', 0, 1.48, 0.26);
  b.addBond(cCenter, cTop, 'single');
  b.addBond(cTop, b.addAtom('O', -0.92, 2.16, 0.68), 'double');
  const oTopH = b.addAtom('O', 1.12, 2.08, 0.02);
  b.addBond(cTop, oTopH, 'single');
  b.addBond(oTopH, b.addAtom('H', 1.14, 2.98, 0.24), 'single');

  // 左翼羧基 -COOH
  const cCarbL = b.addAtom('C', -2.52, 0.52, -0.38);
  b.addBond(cLeft, cCarbL, 'single');
  b.addBond(cCarbL, b.addAtom('O', -2.32, 1.46, -1.14), 'double');
  const oLH = b.addAtom('O', -3.74, 0.14, -0.02);
  b.addBond(cCarbL, oLH, 'single');
  b.addBond(oLH, b.addAtom('H', -4.42, 0.72, -0.38), 'single');

  // 右翼羧基 -COOH
  const cCarbR = b.addAtom('C', 2.52, 0.52, 0.38);
  b.addBond(cRight, cCarbR, 'single');
  b.addBond(cCarbR, b.addAtom('O', 2.32, 1.46, 1.14), 'double');
  const oRH = b.addAtom('O', 3.74, 0.14, 0.02);
  b.addBond(cCarbR, oRH, 'single');
  b.addBond(oRH, b.addAtom('H', 4.42, 0.72, 0.38), 'single');

  // 亚甲基氢 -CH2-
  b.addBond(cLeft, b.addAtom('H', -1.64, -1.36, -0.12), 'single');
  b.addBond(cLeft, b.addAtom('H', -1.58, -0.38, 1.28), 'single');
  b.addBond(cRight, b.addAtom('H', 1.64, -1.36, 0.12), 'single');
  b.addBond(cRight, b.addAtom('H', 1.58, -0.38, -1.28), 'single');

  return {
    key: 'C6H8O7',
    formula: 'C₆H₈O₇',
    name: '柠檬酸',
    structureType: 'covalent',
    geometryLabel: '三元羟基羧酸三维交错构象',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

function buildSucrose(): MolecularStructureDef {
  // 蔗糖 C12H22O11（α-D-吡喃葡萄糖环 -O- β-D-呋喃果糖环双糖糖苷键连接）
  const b = new StructureBuilder();
  const oGlyco = b.addAtom('O', 0, 0.18, 0.32);

  // 左侧六元吡喃环
  const gCoords: Array<[string, number, number, number]> = [
    ['C', -1.16, -0.22, 0.94],
    ['C', -2.38, 0.24, 0.18],
    ['C', -3.58, -0.26, 0.94],
    ['C', -3.48, -0.12, 2.44],
    ['C', -2.22, -0.62, 3.10],
    ['O', -1.12, -0.12, 2.34],
  ];
  const gIdx = gCoords.map(([el, x, y, z]) => b.addAtom(el, x, y, z));
  for (let i = 0; i < 6; i++) {
    b.addBond(gIdx[i], gIdx[(i + 1) % 6], 'single');
  }
  b.addBond(oGlyco, gIdx[0], 'single');

  // 左侧外围羟基与羟甲基
  for (const [ci, ox, oy, oz] of [
    [1, -2.42, 1.58, 0.02],
    [2, -4.74, 0.28, 0.42],
    [3, -4.58, -0.58, 3.16],
  ] as const) {
    const oi = b.addAtom('O', ox, oy, oz);
    b.addBond(gIdx[ci], oi, 'single');
    b.addBond(oi, b.addAtom('H', ox * 1.12, oy + 0.45, oz), 'single');
  }
  const gc6 = b.addAtom('C', -2.06, -0.42, 4.58);
  const go6 = b.addAtom('O', -0.92, -1.04, 5.10);
  b.addBond(gIdx[4], gc6, 'single');
  b.addBond(gc6, go6, 'single');
  b.addBond(go6, b.addAtom('H', -0.78, -0.92, 5.98), 'single');

  // 右侧五元呋喃果糖信封环
  const fCoords: Array<[string, number, number, number]> = [
    ['C', 1.24, -0.18, 0.88],
    ['C', 2.38, 0.36, 0.04],
    ['C', 3.58, -0.24, 0.74],
    ['C', 3.06, -0.52, 2.14],
    ['O', 1.66, -0.22, 2.22],
  ];
  const fIdx = fCoords.map(([el, x, y, z]) => b.addAtom(el, x, y, z));
  for (let i = 0; i < 5; i++) {
    b.addBond(fIdx[i], fIdx[(i + 1) % 5], 'single');
  }
  b.addBond(oGlyco, fIdx[0], 'single');

  // 右侧外围羟甲基与羟基
  const fc1 = b.addAtom('C', 1.32, -1.56, 0.26);
  const fo1 = b.addAtom('O', 0.46, -2.44, 0.88);
  b.addBond(fIdx[0], fc1, 'single');
  b.addBond(fc1, fo1, 'single');
  b.addBond(fo1, b.addAtom('H', 0.52, -3.28, 0.48), 'single');

  for (const [ci, ox, oy, oz] of [
    [1, 2.38, 1.72, -0.16],
    [2, 4.72, 0.48, 0.72],
  ] as const) {
    const oi = b.addAtom('O', ox, oy, oz);
    b.addBond(fIdx[ci], oi, 'single');
    b.addBond(oi, b.addAtom('H', ox + 0.52, oy + 0.44, oz), 'single');
  }

  const fc6 = b.addAtom('C', 3.78, -0.18, 3.42);
  const fo6 = b.addAtom('O', 5.06, -0.72, 3.48);
  b.addBond(fIdx[3], fc6, 'single');
  b.addBond(fc6, fo6, 'single');
  b.addBond(fo6, b.addAtom('H', 5.52, -0.52, 4.26), 'single');

  return {
    key: 'C12H22O11',
    formula: 'C₁₂H₂₂O₁₁',
    name: '蔗糖',
    structureType: 'covalent',
    geometryLabel: '双糖吡喃-呋喃糖苷键三维环构象',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

function buildPhenolphthalein(): MolecularStructureDef {
  // 酚酞 C20H14O4（三苯甲烷内酯螺旋桨式三维构型）
  const b = new StructureBuilder();
  const cSp3 = b.addAtom('C', 0, 0, 0);

  const addPhenyl = (
    dirX: number,
    dirY: number,
    dirZ: number,
    tiltZ: number,
    withParaOH: boolean
  ): number[] => {
    const len = Math.hypot(dirX, dirY, dirZ) || 1;
    const ux = dirX / len;
    const uy = dirY / len;
    const uz = dirZ / len;

    // 局部正交基
    let vx = -uy;
    let vy = ux;
    let vz = 0;
    const vLen = Math.hypot(vx, vy, vz) || 1;
    vx /= vLen;
    vy /= vLen;

    const wx = uy * vz - uz * vy;
    const wy = uz * vx - ux * vz;
    const wz = ux * vy - uy * vx;

    const ct = Math.cos(tiltZ);
    const st = Math.sin(tiltZ);
    const px = vx * ct + wx * st;
    const py = vy * ct + wy * st;
    const pz = vz * ct + wz * st;

    const rRing = 1.18;
    const centerDist = 1.42 + rRing;
    const cx = ux * centerDist;
    const cy = uy * centerDist;
    const cz = uz * centerDist;

    const ring: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i * Math.PI) / 3;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = cx + (ux * ca + px * sa) * rRing;
      const y = cy + (uy * ca + py * sa) * rRing;
      const z = cz + (uz * ca + pz * sa) * rRing;
      ring.push(b.addAtom('C', x, y, z));
    }
    for (let i = 0; i < 6; i++) {
      b.addBond(ring[i], ring[(i + 1) % 6], i % 2 === 0 ? 'double' : 'single');
    }
    b.addBond(cSp3, ring[0], 'single');

    if (withParaOH) {
      const ox = cx + ux * (rRing + 1.16);
      const oy = cy + uy * (rRing + 1.16);
      const oz = cz + uz * (rRing + 1.16);
      const oIdx = b.addAtom('O', ox, oy, oz);
      b.addBond(ring[3], oIdx, 'single');
      b.addBond(oIdx, b.addAtom('H', ox + px * 0.72 + ux * 0.45, oy + py * 0.72 + uy * 0.45, oz + pz * 0.72 + uz * 0.45), 'single');
    }
    return ring;
  };

  // 两个对羟基苯环
  addPhenyl(-0.88, 0.56, 0.25, 0.48, true);
  addPhenyl(0.88, 0.56, -0.25, -0.48, true);

  // 下方苯并内酯环
  const ring3 = addPhenyl(0, -1.0, 0, 0.2, false);
  const oLactone = b.addAtom('O', 0.96, -0.68, 0.42);
  const cCarbonyl = b.addAtom('C', 1.42, -1.84, 0.36);
  const oCarbonyl = b.addAtom('O', 2.48, -2.18, 0.62);
  b.addBond(cSp3, oLactone, 'single');
  b.addBond(oLactone, cCarbonyl, 'single');
  b.addBond(cCarbonyl, ring3[1], 'single');
  b.addBond(cCarbonyl, oCarbonyl, 'double');

  return {
    key: 'C20H14O4',
    formula: 'C₂₀H₁₄O₄',
    name: '酚酞指示剂',
    structureType: 'covalent',
    geometryLabel: '三苯甲烷内酯螺旋桨式三维构型',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

function buildLitmusChromophore(): MolecularStructureDef {
  // 石蕊显色生色团母核：7-羟基吩噁嗪酮 (7-hydroxyphenoxazin-3-one)
  const b = new StructureBuilder();
  // 中央六元噁嗪环
  const nMid = b.addAtom('N', 0, 1.24, 0);
  const oMid = b.addAtom('O', 0, -1.24, 0);
  const cL1 = b.addAtom('C', -1.16, 0.62, 0);
  const cL2 = b.addAtom('C', -1.16, -0.62, 0);
  const cR1 = b.addAtom('C', 1.16, 0.62, 0);
  const cR2 = b.addAtom('C', 1.16, -0.62, 0);

  b.addBond(nMid, cL1, 'double');
  b.addBond(cL1, cL2, 'single');
  b.addBond(cL2, oMid, 'single');
  b.addBond(oMid, cR2, 'single');
  b.addBond(cR2, cR1, 'double');
  b.addBond(cR1, nMid, 'single');

  // 左侧醌环
  const l3 = b.addAtom('C', -2.38, 1.24, 0);
  const l4 = b.addAtom('C', -3.56, 0.62, 0);
  const l5 = b.addAtom('C', -3.56, -0.62, 0);
  const l6 = b.addAtom('C', -2.38, -1.24, 0);
  b.addBond(cL1, l3, 'single');
  b.addBond(l3, l4, 'double');
  b.addBond(l4, l5, 'single');
  b.addBond(l5, l6, 'single');
  b.addBond(l6, cL2, 'double');
  b.addBond(l5, b.addAtom('O', -4.68, -1.22, 0), 'double');

  // 右侧酚环
  const r3 = b.addAtom('C', 2.38, 1.24, 0);
  const r4 = b.addAtom('C', 3.56, 0.62, 0);
  const r5 = b.addAtom('C', 3.56, -0.62, 0);
  const r6 = b.addAtom('C', 2.38, -1.24, 0);
  b.addBond(cR1, r3, 'single');
  b.addBond(r3, r4, 'double');
  b.addBond(r4, r5, 'single');
  b.addBond(r5, r6, 'double');
  b.addBond(r6, cR2, 'single');

  const oh = b.addAtom('O', 4.68, -1.22, 0);
  b.addBond(r5, oh, 'single');
  b.addBond(oh, b.addAtom('H', 5.38, -0.64, 0), 'single');

  return {
    key: 'Litmus',
    formula: 'C₇H₇NO₄',
    name: '石蕊显色母核',
    structureType: 'covalent',
    geometryLabel: '吩噁嗪酮三环共轭显色母核',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

// ============================================================================
// 标准分子与晶体字典构建器
// ============================================================================

const EXACT_BUILDERS: Record<string, (formula: string, name: string) => MolecularStructureDef> = {
  // 1. 水、气体与双原子分子
  H2O: (f, n) => {
    const b = new StructureBuilder();
    const o = b.addAtom('O', 0, 0.30, 0);
    const h1 = b.addAtom('H', -0.94, -0.44, 0);
    const h2 = b.addAtom('H', 0.94, -0.44, 0);
    b.addBond(o, h1, 'single');
    b.addBond(o, h2, 'single');
    return { key: 'H2O', formula: f || 'H₂O', name: n || '水分子', structureType: 'covalent', geometryLabel: 'V 型极性共价分子 (104.5°)', atoms: b.atoms, bonds: b.bonds };
  },
  H2: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('H', -0.58, 0, 0), b.addAtom('H', 0.58, 0, 0), 'single');
    return { key: 'H2', formula: f || 'H₂', name: n || '氢气', structureType: 'covalent', geometryLabel: '直线型双原子单键分子', atoms: b.atoms, bonds: b.bonds };
  },
  O2: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('O', -0.74, 0, 0), b.addAtom('O', 0.74, 0, 0), 'double');
    return { key: 'O2', formula: f || 'O₂', name: n || '氧气', structureType: 'covalent', geometryLabel: '直线型双键顺磁分子 (O=O)', atoms: b.atoms, bonds: b.bonds };
  },
  N2: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('N', -0.70, 0, 0), b.addAtom('N', 0.70, 0, 0), 'triple');
    return { key: 'N2', formula: f || 'N₂', name: n || '氮气', structureType: 'covalent', geometryLabel: '直线型叁键分子 (N≡N)', atoms: b.atoms, bonds: b.bonds };
  },
  Cl2: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('Cl', -0.92, 0, 0), b.addAtom('Cl', 0.92, 0, 0), 'single');
    return { key: 'Cl2', formula: f || 'Cl₂', name: n || '氯气', structureType: 'covalent', geometryLabel: '直线型双原子卤素分子', atoms: b.atoms, bonds: b.bonds };
  },
  Br2: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('Br', -0.98, 0, 0), b.addAtom('Br', 0.98, 0, 0), 'single');
    return { key: 'Br2', formula: f || 'Br₂', name: n || '溴单质', structureType: 'covalent', geometryLabel: '直线型双原子卤素分子', atoms: b.atoms, bonds: b.bonds };
  },
  I2: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('I', -1.08, 0, 0), b.addAtom('I', 1.08, 0, 0), 'single');
    return { key: 'I2', formula: f || 'I₂', name: n || '碘单质', structureType: 'covalent', geometryLabel: '直线型双原子卤素分子', atoms: b.atoms, bonds: b.bonds };
  },
  CO2: (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', 0, 0, 0);
    const o1 = b.addAtom('O', -1.16, 0, 0);
    const o2 = b.addAtom('O', 1.16, 0, 0);
    b.addBond(c, o1, 'double');
    b.addBond(c, o2, 'double');
    return { key: 'CO2', formula: f || 'CO₂', name: n || '二氧化碳', structureType: 'covalent', geometryLabel: '直线型双键对称分子 (O=C=O, 180°)', atoms: b.atoms, bonds: b.bonds };
  },
  CO: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('C', -0.66, 0, 0), b.addAtom('O', 0.66, 0, 0), 'triple');
    return { key: 'CO', formula: f || 'CO', name: n || '一氧化碳', structureType: 'covalent', geometryLabel: '直线型极性叁键分子', atoms: b.atoms, bonds: b.bonds };
  },
  H2O2: (f, n) => {
    const b = new StructureBuilder();
    const o1 = b.addAtom('O', -0.70, 0.16, 0);
    const o2 = b.addAtom('O', 0.70, 0.16, 0);
    const h1 = b.addAtom('H', -1.06, -0.56, 0.58);
    const h2 = b.addAtom('H', 1.06, -0.56, -0.58);
    b.addBond(o1, o2, 'single');
    b.addBond(o1, h1, 'single');
    b.addBond(o2, h2, 'single');
    return { key: 'H2O2', formula: f || 'H₂O₂', name: n || '过氧化氢', structureType: 'covalent', geometryLabel: '书页状异面交叉构型 (二面角 111.5°)', atoms: b.atoms, bonds: b.bonds };
  },
  NH3: (f, n) => {
    const b = new StructureBuilder();
    const nIdx = b.addAtom('N', 0, 0.32, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3;
      b.addBond(nIdx, b.addAtom('H', Math.cos(a) * 0.96, -0.26, Math.sin(a) * 0.96), 'single');
    }
    return { key: 'NH3', formula: f || 'NH₃', name: n || '氨分子', structureType: 'covalent', geometryLabel: '三角锥形分子 (107.3°)', atoms: b.atoms, bonds: b.bonds };
  },
  CH4: (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', 0, 0, 0);
    const d = 0.68;
    for (const [x, y, z] of [[d, d, d], [d, -d, -d], [-d, d, -d], [-d, -d, d]] as const) {
      b.addBond(c, b.addAtom('H', x, y, z), 'single');
    }
    return { key: 'CH4', formula: f || 'CH₄', name: n || '甲烷', structureType: 'covalent', geometryLabel: '正四面体分子 (109.5°)', atoms: b.atoms, bonds: b.bonds };
  },
  SO2: (f, n) => {
    const b = new StructureBuilder();
    const s = b.addAtom('S', 0, 0.32, 0);
    b.addBond(s, b.addAtom('O', -1.16, -0.34, 0), 'double');
    b.addBond(s, b.addAtom('O', 1.16, -0.34, 0), 'double');
    return { key: 'SO2', formula: f || 'SO₂', name: n || '二氧化硫', structureType: 'covalent', geometryLabel: 'V 型共轭分子 (119.5°)', atoms: b.atoms, bonds: b.bonds };
  },

  // 2. 无机强酸与含氧酸
  HCl: (f, n) => {
    const b = new StructureBuilder();
    const h = b.addAtom('H', -0.86, 0, 0);
    const cl = b.addAtom('Cl', 0.46, 0, 0);
    b.addBond(h, cl, 'single');
    return { key: 'HCl', formula: f || 'HCl', name: n || '氯化氢 / 盐酸', structureType: 'covalent', geometryLabel: '极性共价双原子分子 (H—Cl)', atoms: b.atoms, bonds: b.bonds };
  },
  HI: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('H', -0.98, 0, 0), b.addAtom('I', 0.48, 0, 0), 'single');
    return { key: 'HI', formula: f || 'HI', name: n || '碘化氢', structureType: 'covalent', geometryLabel: '极性共价双原子分子 (H—I)', atoms: b.atoms, bonds: b.bonds };
  },
  HBr: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('H', -0.92, 0, 0), b.addAtom('Br', 0.46, 0, 0), 'single');
    return { key: 'HBr', formula: f || 'HBr', name: n || '溴化氢', structureType: 'covalent', geometryLabel: '极性共价双原子分子 (H—Br)', atoms: b.atoms, bonds: b.bonds };
  },
  HF: (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('H', -0.78, 0, 0), b.addAtom('F', 0.44, 0, 0), 'single');
    return { key: 'HF', formula: f || 'HF', name: n || '氟化氢', structureType: 'covalent', geometryLabel: '强极性共价双原子分子 (H—F)', atoms: b.atoms, bonds: b.bonds };
  },
  H2SO4: (f, n) => {
    const b = new StructureBuilder();
    const s = b.addAtom('S', 0, 0, 0);
    const o1 = b.addAtom('O', 0, 0.96, 1.02);
    const o2 = b.addAtom('O', 0, 0.96, -1.02);
    const o3 = b.addAtom('O', -1.06, -0.84, 0);
    const o4 = b.addAtom('O', 1.06, -0.84, 0);
    const h1 = b.addAtom('H', -1.68, -0.36, 0.48);
    const h2 = b.addAtom('H', 1.68, -0.36, -0.48);
    b.addBond(s, o1, 'double');
    b.addBond(s, o2, 'double');
    b.addBond(s, o3, 'single');
    b.addBond(s, o4, 'single');
    b.addBond(o3, h1, 'single');
    b.addBond(o4, h2, 'single');
    return { key: 'H2SO4', formula: f || 'H₂SO₄', name: n || '硫酸', structureType: 'covalent', geometryLabel: '硫中心四面体二元含氧酸构型', atoms: b.atoms, bonds: b.bonds };
  },
  HNO3: (f, n) => {
    const b = new StructureBuilder();
    const nIdx = b.addAtom('N', 0, 0.08, 0);
    const o1 = b.addAtom('O', -1.08, 0.72, 0);
    const o2 = b.addAtom('O', 1.08, 0.72, 0);
    const o3 = b.addAtom('O', 0, -1.24, 0);
    const h = b.addAtom('H', 0.86, -1.66, 0);
    b.addBond(nIdx, o1, 'double');
    b.addBond(nIdx, o2, 'double');
    b.addBond(nIdx, o3, 'single');
    b.addBond(o3, h, 'single');
    return { key: 'HNO3', formula: f || 'HNO₃', name: n || '硝酸', structureType: 'covalent', geometryLabel: '平面三角形离域 π 键构型', atoms: b.atoms, bonds: b.bonds };
  },
  H2CO3: (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', 0, 0.06, 0);
    const oTop = b.addAtom('O', 0, 1.32, 0);
    const oL = b.addAtom('O', -1.12, -0.62, 0);
    const oR = b.addAtom('O', 1.12, -0.62, 0);
    b.addBond(c, oTop, 'double');
    b.addBond(c, oL, 'single');
    b.addBond(c, oR, 'single');
    b.addBond(oL, b.addAtom('H', -1.82, -0.14, 0.28), 'single');
    b.addBond(oR, b.addAtom('H', 1.82, -0.14, -0.28), 'single');
    return { key: 'H2CO3', formula: f || 'H₂CO₃', name: n || '碳酸', structureType: 'covalent', geometryLabel: '平面三角形碳酰二羟基构型', atoms: b.atoms, bonds: b.bonds };
  },
  H3PO4: (f, n) => {
    const b = new StructureBuilder();
    const p = b.addAtom('P', 0, 0.08, 0);
    b.addBond(p, b.addAtom('O', 0, 1.46, 0), 'double');
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3;
      const ox = Math.cos(a) * 1.24;
      const oz = Math.sin(a) * 1.24;
      const o = b.addAtom('O', ox, -0.52, oz);
      b.addBond(p, o, 'single');
      b.addBond(o, b.addAtom('H', ox * 1.46, -0.18, oz * 1.46), 'single');
    }
    return { key: 'H3PO4', formula: f || 'H₃PO₄', name: n || '磷酸', structureType: 'covalent', geometryLabel: '磷中心四面体三元含氧酸构型', atoms: b.atoms, bonds: b.bonds };
  },

  // 3. 立方岩盐晶格卤化物 (NaCl, KCl, KI, NaI, AgCl)
  NaCl: (f, n) => buildRocksaltLattice('NaCl', f || 'NaCl', n || '氯化钠', 'Na', 'Na⁺', 'Cl', 'Cl⁻', 0.96),
  KCl:  (f, n) => buildRocksaltLattice('KCl',  f || 'KCl',  n || '氯化钾', 'K',  'K⁺',  'Cl', 'Cl⁻', 1.02),
  KI:   (f, n) => buildRocksaltLattice('KI',   f || 'KI',   n || '碘化钾', 'K',  'K⁺',  'I',  'I⁻',  1.08),
  NaI:  (f, n) => buildRocksaltLattice('NaI',  f || 'NaI',  n || '碘化钠', 'Na', 'Na⁺', 'I',  'I⁻',  1.04),
  AgCl: (f, n) => buildRocksaltLattice('AgCl', f || 'AgCl', n || '氯化银', 'Ag', 'Ag⁺', 'Cl', 'Cl⁻', 0.98),

  // 4. 多价金属氯化物
  BaCl2: (f, n) => buildMetalHalide('BaCl2', f || 'BaCl₂', n || '氯化钡', 'Ba', 'Ba²⁺', 'Cl', 'Cl⁻', 2),
  CaCl2: (f, n) => buildMetalHalide('CaCl2', f || 'CaCl₂', n || '氯化钙', 'Ca', 'Ca²⁺', 'Cl', 'Cl⁻', 2),
  MgCl2: (f, n) => buildMetalHalide('MgCl2', f || 'MgCl₂', n || '氯化镁', 'Mg', 'Mg²⁺', 'Cl', 'Cl⁻', 2),
  ZnCl2: (f, n) => buildMetalHalide('ZnCl2', f || 'ZnCl₂', n || '氯化锌', 'Zn', 'Zn²⁺', 'Cl', 'Cl⁻', 2),
  CuCl2: (f, n) => buildMetalHalide('CuCl2', f || 'CuCl₂', n || '氯化铜', 'Cu', 'Cu²⁺', 'Cl', 'Cl⁻', 2),
  FeCl2: (f, n) => buildMetalHalide('FeCl2', f || 'FeCl₂', n || '氯化亚铁', 'Fe', 'Fe²⁺', 'Cl', 'Cl⁻', 2),
  MnCl2: (f, n) => buildMetalHalide('MnCl2', f || 'MnCl₂', n || '氯化锰', 'Mn', 'Mn²⁺', 'Cl', 'Cl⁻', 2),
  FeCl3: (f, n) => buildMetalHalide('FeCl3', f || 'FeCl₃', n || '氯化铁', 'Fe', 'Fe³⁺', 'Cl', 'Cl⁻', 3),
  AlCl3: (f, n) => buildMetalHalide('AlCl3', f || 'AlCl₃', n || '氯化铝', 'Al', 'Al³⁺', 'Cl', 'Cl⁻', 3),

  // 5. 强碱与难溶氢氧化物沉淀
  NaOH:      (f, n) => buildHydroxide('NaOH', f || 'NaOH', n || '氢氧化钠', 'Na', 'Na⁺', 1),
  KOH:       (f, n) => buildHydroxide('KOH',  f || 'KOH',  n || '氢氧化钾', 'K',  'K⁺',  1),
  'Ca(OH)2': (f, n) => buildHydroxide('Ca(OH)2', f || 'Ca(OH)₂', n || '氢氧化钙', 'Ca', 'Ca²⁺', 2),
  CaOH2:     (f, n) => buildHydroxide('Ca(OH)2', f || 'Ca(OH)₂', n || '氢氧化钙', 'Ca', 'Ca²⁺', 2),
  'Cu(OH)2': (f, n) => buildHydroxide('Cu(OH)2', f || 'Cu(OH)₂', n || '氢氧化铜', 'Cu', 'Cu²⁺', 2),
  'Fe(OH)2': (f, n) => buildHydroxide('Fe(OH)2', f || 'Fe(OH)₂', n || '氢氧化亚铁', 'Fe', 'Fe²⁺', 2),
  'Fe(OH)3': (f, n) => buildHydroxide('Fe(OH)3', f || 'Fe(OH)₃', n || '氢氧化铁', 'Fe', 'Fe³⁺', 3),
  'Al(OH)3': (f, n) => buildHydroxide('Al(OH)3', f || 'Al(OH)₃', n || '氢氧化铝', 'Al', 'Al³⁺', 3),

  // 6. 硫酸盐与硫酸钡沉淀
  CuSO4:       (f, n) => buildDivalentSulfate('CuSO4', f || 'CuSO₄', n || '硫酸铜', 'Cu', 'Cu²⁺'),
  FeSO4:       (f, n) => buildDivalentSulfate('FeSO4', f || 'FeSO₄', n || '硫酸亚铁', 'Fe', 'Fe²⁺'),
  MgSO4:       (f, n) => buildDivalentSulfate('MgSO4', f || 'MgSO₄', n || '硫酸镁', 'Mg', 'Mg²⁺'),
  ZnSO4:       (f, n) => buildDivalentSulfate('ZnSO4', f || 'ZnSO₄', n || '硫酸锌', 'Zn', 'Zn²⁺'),
  MnSO4:       (f, n) => buildDivalentSulfate('MnSO4', f || 'MnSO₄', n || '硫酸锰', 'Mn', 'Mn²⁺'),
  BaSO4:       (f, n) => buildDivalentSulfate('BaSO4', f || 'BaSO₄', n || '硫酸钡', 'Ba', 'Ba²⁺'),
  Na2SO4:      (f, n) => buildMonovalentSulfate('Na2SO4', f || 'Na₂SO₄', n || '硫酸钠', 'Na', 'Na⁺'),
  K2SO4:       (f, n) => buildMonovalentSulfate('K2SO4',  f || 'K₂SO₄',  n || '硫酸钾', 'K',  'K⁺'),
  'Fe2(SO4)3': (f, n) => buildTrivalentSulfate('Fe2(SO4)3', f || 'Fe₂(SO₄)₃', n || '硫酸铁', 'Fe', 'Fe³⁺'),
  'Al2(SO4)3': (f, n) => buildTrivalentSulfate('Al2(SO4)3', f || 'Al₂(SO₄)₃', n || '硫酸铝', 'Al', 'Al³⁺'),

  // 7. 碳酸盐、碳酸氢盐与碳酸钙沉淀
  CaCO3: (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', -0.42, 0, 0);
    const oTerm = b.addAtom('O', -1.68, 0, 0);
    const oB1 = b.addAtom('O', 0.24, 1.04, 0);
    const oB2 = b.addAtom('O', 0.24, -1.04, 0);
    const ca = b.addAtom('Ca', 1.56, 0, 0, 'Ca²⁺', 2);
    b.addBond(c, oTerm, 'double');
    b.addBond(c, oB1, 'single');
    b.addBond(c, oB2, 'single');
    b.addBond(ca, oB1, 'ionic');
    b.addBond(ca, oB2, 'ionic');
    return { key: 'CaCO3', formula: f || 'CaCO₃', name: n || '碳酸钙', structureType: 'polyatomic-salt', geometryLabel: '平面三角形碳酸根钙离子配位构型', atoms: b.atoms, bonds: b.bonds };
  },
  Na2CO3: (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', 0, 0, 0);
    const oTop = b.addAtom('O', 0, 1.28, 0);
    const oL = b.addAtom('O', -1.10, -0.64, 0);
    const oR = b.addAtom('O', 1.10, -0.64, 0);
    const naL = b.addAtom('Na', -1.96, 0.72, 0.24, 'Na⁺', 1);
    const naR = b.addAtom('Na', 1.96, 0.72, -0.24, 'Na⁺', 1);
    b.addBond(c, oTop, 'double');
    b.addBond(c, oL, 'single');
    b.addBond(c, oR, 'single');
    b.addBond(naL, oTop, 'ionic');
    b.addBond(naL, oL, 'ionic');
    b.addBond(naR, oTop, 'ionic');
    b.addBond(naR, oR, 'ionic');
    return { key: 'Na2CO3', formula: f || 'Na₂CO₃', name: n || '碳酸钠', structureType: 'polyatomic-salt', geometryLabel: '平面碳酸根双钠离子配位构型', atoms: b.atoms, bonds: b.bonds };
  },
  K2CO3: (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', 0, 0, 0);
    const oTop = b.addAtom('O', 0, 1.28, 0);
    const oL = b.addAtom('O', -1.10, -0.64, 0);
    const oR = b.addAtom('O', 1.10, -0.64, 0);
    const kL = b.addAtom('K', -2.04, 0.72, 0.24, 'K⁺', 1);
    const kR = b.addAtom('K', 2.04, 0.72, -0.24, 'K⁺', 1);
    b.addBond(c, oTop, 'double');
    b.addBond(c, oL, 'single');
    b.addBond(c, oR, 'single');
    b.addBond(kL, oTop, 'ionic');
    b.addBond(kL, oL, 'ionic');
    b.addBond(kR, oTop, 'ionic');
    b.addBond(kR, oR, 'ionic');
    return { key: 'K2CO3', formula: f || 'K₂CO₃', name: n || '碳酸钾', structureType: 'polyatomic-salt', geometryLabel: '平面碳酸根双钾离子配位构型', atoms: b.atoms, bonds: b.bonds };
  },
  NaHCO3: (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', -0.18, 0, 0);
    const oTop = b.addAtom('O', 0.48, 1.12, 0);
    const oBot = b.addAtom('O', 0.48, -1.12, 0);
    const oLeft = b.addAtom('O', -1.48, 0, 0);
    const h = b.addAtom('H', -1.96, -0.78, 0.24);
    const na = b.addAtom('Na', 1.88, 0, 0, 'Na⁺', 1);
    b.addBond(c, oTop, 'double');
    b.addBond(c, oBot, 'single');
    b.addBond(c, oLeft, 'single');
    b.addBond(oLeft, h, 'single');
    b.addBond(na, oTop, 'ionic');
    b.addBond(na, oBot, 'ionic');
    return { key: 'NaHCO3', formula: f || 'NaHCO₃', name: n || '碳酸氢钠', structureType: 'polyatomic-salt', geometryLabel: '碳酸氢根钠离子配位构型', atoms: b.atoms, bonds: b.bonds };
  },
  KHCO3: (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', -0.18, 0, 0);
    const oTop = b.addAtom('O', 0.48, 1.12, 0);
    const oBot = b.addAtom('O', 0.48, -1.12, 0);
    const oLeft = b.addAtom('O', -1.48, 0, 0);
    const h = b.addAtom('H', -1.96, -0.78, 0.24);
    const k = b.addAtom('K', 1.98, 0, 0, 'K⁺', 1);
    b.addBond(c, oTop, 'double');
    b.addBond(c, oBot, 'single');
    b.addBond(c, oLeft, 'single');
    b.addBond(oLeft, h, 'single');
    b.addBond(k, oTop, 'ionic');
    b.addBond(k, oBot, 'ionic');
    return { key: 'KHCO3', formula: f || 'KHCO₃', name: n || '碳酸氢钾', structureType: 'polyatomic-salt', geometryLabel: '碳酸氢根钾离子配位构型', atoms: b.atoms, bonds: b.bonds };
  },

  // 8. 硝酸盐与高锰酸钾
  AgNO3:      (f, n) => buildNitrateSalt('AgNO3', f || 'AgNO₃', n || '硝酸银', 'Ag', 'Ag⁺', 1),
  NaNO3:      (f, n) => buildNitrateSalt('NaNO3', f || 'NaNO₃', n || '硝酸钠', 'Na', 'Na⁺', 1),
  KNO3:       (f, n) => buildNitrateSalt('KNO3',  f || 'KNO₃',  n || '硝酸钾', 'K',  'K⁺',  1),
  'Cu(NO3)2': (f, n) => buildNitrateSalt('Cu(NO3)2', f || 'Cu(NO₃)₂', n || '硝酸铜', 'Cu', 'Cu²⁺', 2),
  'Ba(NO3)2': (f, n) => buildNitrateSalt('Ba(NO3)2', f || 'Ba(NO₃)₂', n || '硝酸钡', 'Ba', 'Ba²⁺', 2),
  'Ca(NO3)2': (f, n) => buildNitrateSalt('Ca(NO3)2', f || 'Ca(NO₃)₂', n || '硝酸钙', 'Ca', 'Ca²⁺', 2),
  'Mg(NO3)2': (f, n) => buildNitrateSalt('Mg(NO3)2', f || 'Mg(NO₃)₂', n || '硝酸镁', 'Mg', 'Mg²⁺', 2),
  'Zn(NO3)2': (f, n) => buildNitrateSalt('Zn(NO3)2', f || 'Zn(NO₃)₂', n || '硝酸锌', 'Zn', 'Zn²⁺', 2),
  'Fe(NO3)3': (f, n) => buildNitrateSalt('Fe(NO3)3', f || 'Fe(NO₃)₃', n || '硝酸铁', 'Fe', 'Fe³⁺', 3),
  'Al(NO3)3': (f, n) => buildNitrateSalt('Al(NO3)3', f || 'Al(NO₃)₃', n || '硝酸铝', 'Al', 'Al³⁺', 3),

  KMnO4: (f, n) => {
    const b = new StructureBuilder();
    const mn = b.addAtom('Mn', -0.42, 0, 0, 'Mn');
    const o1 = b.addAtom('O', -1.24, 0.96, 0);
    const o2 = b.addAtom('O', -1.24, -0.96, 0);
    const o3 = b.addAtom('O', 0.42, 0, 0.96);
    const o4 = b.addAtom('O', 0.42, 0, -0.96);
    const k = b.addAtom('K', 1.72, 0, 0, 'K⁺', 1);
    b.addBond(mn, o1, 'double');
    b.addBond(mn, o2, 'double');
    b.addBond(mn, o3, 'double');
    b.addBond(mn, o4, 'single');
    b.addBond(k, o3, 'ionic');
    b.addBond(k, o4, 'ionic');
    return { key: 'KMnO4', formula: f || 'KMnO₄', name: n || '高锰酸钾', structureType: 'polyatomic-salt', geometryLabel: '正四面体高锰酸根配位构型', atoms: b.atoms, bonds: b.bonds };
  },

  // 9. 固态金属单质晶胞
  Fe: (_f, n) => buildBCCMetalLattice('Fe', n || '铁金属晶胞'),
  Na: (_f, n) => buildBCCMetalLattice('Na', n || '金属钠晶胞'),
  Cu: (_f, n) => buildFCCMetalLattice('Cu', n || '紫铜金属晶胞'),
  Al: (_f, n) => buildFCCMetalLattice('Al', n || '金属铝晶胞'),
  Ag: (_f, n) => buildFCCMetalLattice('Ag', n || '金属银晶胞'),
  Mg: (_f, n) => buildHCPMetalLattice('Mg', n || '镁金属晶胞'),
  Zn: (_f, n) => buildHCPMetalLattice('Zn', n || '锌金属晶胞'),

  // 10. 有机化合物与指示剂
  CH3COOH: (f, n) => {
    const b = new StructureBuilder();
    const c1 = b.addAtom('C', -0.86, -0.10, 0);
    const c2 = b.addAtom('C', 0.62, 0.08, 0);
    const oDouble = b.addAtom('O', 1.24, 1.18, 0);
    const oSingle = b.addAtom('O', 1.32, -1.08, 0);
    const hAcid = b.addAtom('H', 2.24, -0.92, 0.16);
    b.addBond(c1, c2, 'single');
    b.addBond(c2, oDouble, 'double');
    b.addBond(c2, oSingle, 'single');
    b.addBond(oSingle, hAcid, 'single');
    b.addBond(c1, b.addAtom('H', -1.32, 0.86, 0), 'single');
    b.addBond(c1, b.addAtom('H', -1.24, -0.62, 0.84), 'single');
    b.addBond(c1, b.addAtom('H', -1.24, -0.62, -0.84), 'single');
    return { key: 'CH3COOH', formula: f || 'CH₃COOH', name: n || '乙酸', structureType: 'covalent', geometryLabel: '甲基-平面羧基三维构型', atoms: b.atoms, bonds: b.bonds };
  },
  C2H5OH: (f, n) => {
    const b = new StructureBuilder();
    const c1 = b.addAtom('C', -1.16, -0.18, 0);
    const c2 = b.addAtom('C', 0.24, 0.34, 0);
    const o = b.addAtom('O', 1.22, -0.64, 0);
    b.addBond(c1, c2, 'single');
    b.addBond(c2, o, 'single');
    b.addBond(o, b.addAtom('H', 2.08, -0.24, 0.16), 'single');
    b.addBond(c1, b.addAtom('H', -1.86, 0.62, 0), 'single');
    b.addBond(c1, b.addAtom('H', -1.34, -0.78, 0.84), 'single');
    b.addBond(c1, b.addAtom('H', -1.34, -0.78, -0.84), 'single');
    b.addBond(c2, b.addAtom('H', 0.42, 0.96, 0.84), 'single');
    b.addBond(c2, b.addAtom('H', 0.42, 0.96, -0.84), 'single');
    return { key: 'C2H5OH', formula: f || 'C₂H₅OH', name: n || '乙醇', structureType: 'covalent', geometryLabel: '乙基羟基四面体交错构象', atoms: b.atoms, bonds: b.bonds };
  },
  C6H12O6:   () => buildGlucose(),
  C6H8O7:    () => buildCitricAcid(),
  C8H10N4O2: () => buildCaffeine(),
  C12H22O11: () => buildSucrose(),
  C20H14O4:  () => buildPhenolphthalein(),
  Litmus:    () => buildLitmusChromophore(),

  // 11. 常见多原子游离离子（适配“离子分布”模式卡片点击）
  'OH-': (f, n) => {
    const b = new StructureBuilder();
    b.addBond(b.addAtom('O', -0.42, 0, 0, 'O⁻', -1), b.addAtom('H', 0.56, 0, 0, 'H', 0), 'single');
    return { key: 'OH-', formula: f || 'OH⁻', name: n || '氢氧根离子', structureType: 'ion', geometryLabel: '直线型极性阴离子', atoms: b.atoms, bonds: b.bonds };
  },
  'SO4_2-': (f, n) => {
    const b = new StructureBuilder();
    const s = b.addAtom('S', 0, 0, 0);
    const d = 0.84;
    const pts: Array<[number, number, number, BondKind]> = [
      [d, d, d, 'double'], [d, -d, -d, 'double'], [-d, d, -d, 'single'], [-d, -d, d, 'single'],
    ];
    for (const [x, y, z, kind] of pts) {
      b.addBond(s, b.addAtom('O', x, y, z, kind === 'single' ? 'O⁻' : 'O'), kind);
    }
    return { key: 'SO4_2-', formula: f || 'SO₄²⁻', name: n || '硫酸根离子', structureType: 'ion', geometryLabel: '正四面体多原子阴离子 (109.5°)', atoms: b.atoms, bonds: b.bonds };
  },
  'CO3_2-': (f, n) => {
    const b = new StructureBuilder();
    const c = b.addAtom('C', 0, 0, 0);
    b.addBond(c, b.addAtom('O', 0, 1.28, 0, 'O'), 'double');
    b.addBond(c, b.addAtom('O', -1.11, -0.64, 0, 'O⁻'), 'single');
    b.addBond(c, b.addAtom('O', 1.11, -0.64, 0, 'O⁻'), 'single');
    return { key: 'CO3_2-', formula: f || 'CO₃²⁻', name: n || '碳酸根离子', structureType: 'ion', geometryLabel: '平面正三角形阴离子 (120°)', atoms: b.atoms, bonds: b.bonds };
  },
  'NO3-': (f, n) => {
    const b = new StructureBuilder();
    const nIdx = b.addAtom('N', 0, 0, 0, 'N⁺');
    b.addBond(nIdx, b.addAtom('O', 0, 1.26, 0, 'O'), 'double');
    b.addBond(nIdx, b.addAtom('O', -1.09, -0.63, 0, 'O⁻'), 'single');
    b.addBond(nIdx, b.addAtom('O', 1.09, -0.63, 0, 'O⁻'), 'single');
    return { key: 'NO3-', formula: f || 'NO₃⁻', name: n || '硝酸根离子', structureType: 'ion', geometryLabel: '平面正三角形阴离子 (120°)', atoms: b.atoms, bonds: b.bonds };
  },
  'MnO4-': (f, n) => {
    const b = new StructureBuilder();
    const mn = b.addAtom('Mn', 0, 0, 0, 'Mn');
    const d = 0.84;
    const pts: Array<[number, number, number, BondKind]> = [
      [d, d, d, 'double'], [d, -d, -d, 'double'], [-d, d, -d, 'double'], [-d, -d, d, 'single'],
    ];
    for (const [x, y, z, kind] of pts) {
      b.addBond(mn, b.addAtom('O', x, y, z, kind === 'single' ? 'O⁻' : 'O'), kind);
    }
    return { key: 'MnO4-', formula: f || 'MnO₄⁻', name: n || '高锰酸根离子', structureType: 'ion', geometryLabel: '正四面体高锰酸根阴离子', atoms: b.atoms, bonds: b.bonds };
  },
};

const KEY_ALIASES: Record<string, string> = {
  C2H4O2: 'CH3COOH',
  HC2H3O2: 'CH3COOH',
  C2H6O: 'C2H5OH',
  SO42: 'SO4_2-',
  'SO42-': 'SO4_2-',
  'SO4^2-': 'SO4_2-',
  CO32: 'CO3_2-',
  'CO32-': 'CO3_2-',
  'CO3^2-': 'CO3_2-',
  'NO3-': 'NO3-',
  'MnO4-': 'MnO4-',
  'OH-': 'OH-',
  phenolphthalein: 'C20H14O4',
  litmus: 'Litmus',
};

// ============================================================================
// 通用化学式递归解析与 VSEPR 自动三维构图算法（全覆盖回退保障）
// ============================================================================

/**
 * 递归解析任意化学式（支持括号嵌套与结晶水点号，如 Fe2(SO4)3、CuSO4·5H2O）
 */
export function parseFormulaCounts(formula: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!formula) return counts;

  const normalized = normalizeChemicalKey(formula).replace(/[+-]\d*$|^\d*[+-]/g, '');
  const parts = normalized.split(/[·.]/);

  for (const rawPart of parts) {
    if (!rawPart) continue;
    const coeffMatch = rawPart.match(/^(\d+)(.*)$/);
    const partMultiplier = coeffMatch ? Math.max(1, parseInt(coeffMatch[1], 10)) : 1;
    const expr = coeffMatch ? coeffMatch[2] : rawPart;

    const stack: Array<Map<string, number>> = [new Map()];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (ch === '(' || ch === '[') {
        stack.push(new Map());
        i++;
      } else if (ch === ')' || ch === ']') {
        i++;
        let numStr = '';
        while (i < expr.length && /\d/.test(expr[i])) {
          numStr += expr[i++];
        }
        const mult = numStr ? Math.max(1, parseInt(numStr, 10)) : 1;
        const popped = stack.pop();
        const top = stack[stack.length - 1];
        if (popped && top) {
          for (const [el, c] of popped) {
            top.set(el, (top.get(el) || 0) + c * mult);
          }
        }
      } else if (/[A-Z]/.test(ch)) {
        let sym = ch;
        i++;
        while (i < expr.length && /[a-z]/.test(expr[i])) {
          sym += expr[i++];
        }
        let numStr = '';
        while (i < expr.length && /\d/.test(expr[i])) {
          numStr += expr[i++];
        }
        const mult = numStr ? Math.max(1, parseInt(numStr, 10)) : 1;
        const top = stack[stack.length - 1];
        top.set(sym, (top.get(sym) || 0) + mult);
      } else {
        i++;
      }
    }

    for (const map of stack) {
      for (const [el, c] of map) {
        counts.set(el, (counts.get(el) || 0) + c * partMultiplier);
      }
    }
  }

  return counts;
}

/**
 * 在球面上均匀生成 N 个 VSEPR 配位方向矢量（2: 直线, 3: 平面正三角形, 4: 正四面体, 5: 三角双锥, 6: 正八面体, >6: 斐波那契球面）
 */
function vseprDirections(n: number): Array<[number, number, number]> {
  if (n <= 0) return [];
  if (n === 1) return [[1, 0, 0]];
  if (n === 2) return [[-1, 0, 0], [1, 0, 0]];
  if (n === 3) {
    return [0, 1, 2].map((i) => {
      const a = (i * 2 * Math.PI) / 3 + Math.PI / 2;
      return [Math.cos(a), Math.sin(a), 0];
    });
  }
  if (n === 4) {
    const s = 1 / Math.sqrt(3);
    return [[s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s]];
  }
  if (n === 5) {
    return [
      [0, 1, 0], [0, -1, 0],
      [1, 0, 0], [-0.5, 0, Math.sqrt(3) / 2], [-0.5, 0, -Math.sqrt(3) / 2],
    ];
  }
  if (n === 6) {
    return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  }
  const out: Array<[number, number, number]> = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
  }
  return out;
}

const METAL_ELEMENTS = new Set(['Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Mn', 'Fe', 'Cu', 'Zn', 'Ag', 'Ba']);

function buildFallbackVSEPR(key: string, formula: string, name: string): MolecularStructureDef {
  const counts = parseFormulaCounts(formula);
  const b = new StructureBuilder();

  if (counts.size === 0) {
    b.addAtom('O', 0, 0.28, 0);
    b.addBond(0, b.addAtom('H', -0.92, -0.44, 0), 'single');
    b.addBond(0, b.addAtom('H', 0.92, -0.44, 0), 'single');
    return { key: key || 'H2O', formula: formula || 'H₂O', name: name || '分子模型', structureType: 'covalent', geometryLabel: '三维分子构型', atoms: b.atoms, bonds: b.bonds };
  }

  // 单原子元素或单原子离子
  const entries = Array.from(counts.entries());
  if (entries.length === 1 && entries[0][1] === 1) {
    const el = entries[0][0];
    const isIon = /[⁺⁻+-]/.test(formula);
    if (isIon) {
      b.addAtom(el, 0, 0, 0, formula);
      return {
        key,
        formula,
        name: name || `${el}离子`,
        structureType: 'ion',
        geometryLabel: '量子化水合离子轨道场构型',
        atoms: b.atoms,
        bonds: [],
        orbitalRings: 3,
      };
    }
    if (METAL_ELEMENTS.has(el)) {
      return buildFCCMetalLattice(el, name || `${el}金属晶胞`);
    }
    b.addAtom(el, 0, 0, 0, el);
    return {
      key,
      formula,
      name: name || el,
      structureType: 'ion',
      geometryLabel: '单原子电子云壳层构型',
      atoms: b.atoms,
      bonds: [],
      orbitalRings: 2,
    };
  }

  // 有机骨架或一般无机分子自动 VSEPR 组装
  const backboneEls = entries
    .filter(([el]) => el !== 'H')
    .flatMap(([el, c]) => Array(Math.min(c, 16)).fill(el) as string[]);
  const hCount = Math.min(counts.get('H') || 0, 24);

  if (backboneEls.length === 0) {
    // 纯氢簇
    const dirs = vseprDirections(hCount);
    for (let i = 0; i < dirs.length; i++) {
      b.addAtom('H', dirs[i][0] * 0.7, dirs[i][1] * 0.7, dirs[i][2] * 0.7);
      if (i > 0) b.addBond(0, i, 'single');
    }
  } else if (backboneEls.length === 1) {
    const centerEl = backboneEls[0];
    const center = b.addAtom(centerEl, 0, 0, 0);
    const dirs = vseprDirections(hCount);
    for (const [dx, dy, dz] of dirs) {
      b.addBond(center, b.addAtom('H', dx * 1.15, dy * 1.15, dz * 1.15), 'single');
    }
  } else {
    // 选取高价中心原子排在核心，外围配体与氢按 VSEPR 立体张开
    backboneEls.sort((a, bEl) => getElementSpec(bEl).valence - getElementSpec(a).valence);
    const carbons = backboneEls.filter((e) => e === 'C');

    if (carbons.length >= 2) {
      // 有机碳链锯齿三维骨架 (Zigzag sp3/sp2 chain)
      const cIndices: number[] = [];
      const nC = carbons.length;
      const startX = -((nC - 1) * 1.22) / 2;
      for (let i = 0; i < nC; i++) {
        const x = startX + i * 1.22;
        const y = (i % 2 === 0 ? 0.28 : -0.28);
        const z = (i % 3 === 0 ? 0.14 : -0.14);
        const ci = b.addAtom('C', x, y, z);
        cIndices.push(ci);
        if (i > 0) b.addBond(cIndices[i - 1], ci, 'single');
      }
      const hetero = backboneEls.filter((e) => e !== 'C');
      let hUsed = 0;
      hetero.forEach((el, idx) => {
        const hostIdx = cIndices[idx % cIndices.length];
        const host = b.atoms[hostIdx].position;
        const sign = idx % 2 === 0 ? 1 : -1;
        const aIdx = b.addAtom(el, host[0] + 0.25 * sign, host[1] + 1.24 * sign, host[2] + (idx % 3 - 1) * 0.65);
        const isMetal = METAL_ELEMENTS.has(el);
        b.addBond(hostIdx, aIdx, isMetal ? 'ionic' : (el === 'O' && idx === 0 ? 'double' : 'single'));
        if (el === 'O' && idx > 0 && hUsed < hCount && !isMetal) {
          hUsed++;
          b.addBond(aIdx, b.addAtom('H', host[0] + 0.85 * sign, host[1] + 1.82 * sign, host[2]), 'single');
        }
      });

      const remH = hCount - hUsed;
      for (let i = 0; i < remH; i++) {
        const hostIdx = cIndices[i % cIndices.length];
        const host = b.atoms[hostIdx].position;
        const slot = Math.floor(i / cIndices.length);
        const ang = slot * 2.1 + i * 0.7;
        b.addBond(
          hostIdx,
          b.addAtom('H', host[0] + Math.cos(ang) * 0.45, host[1] + (slot % 2 === 0 ? -0.92 : 0.92), host[2] + Math.sin(ang) * 0.92),
          'single'
        );
      }
    } else {
      // 中心-配体 VSEPR 构型
      const centerEl = backboneEls[0];
      const ligands = backboneEls.slice(1);
      const center = b.addAtom(centerEl, 0, 0, 0);
      const dirs = vseprDirections(ligands.length);
      const ligIndices: number[] = [];

      ligands.forEach((el, idx) => {
        const [dx, dy, dz] = dirs[idx];
        const isMetal = METAL_ELEMENTS.has(el) || METAL_ELEMENTS.has(centerEl);
        const dist = isMetal ? 1.54 : 1.32;
        const li = b.addAtom(el, dx * dist, dy * dist, dz * dist);
        ligIndices.push(li);
        b.addBond(center, li, isMetal ? 'ionic' : 'single');
      });

      for (let i = 0; i < hCount; i++) {
        const hostIdx = ligIndices.length > 0 ? ligIndices[i % ligIndices.length] : center;
        const host = b.atoms[hostIdx].position;
        const len = Math.hypot(host[0], host[1], host[2]) || 1;
        b.addBond(
          hostIdx,
          b.addAtom('H', host[0] + (host[0] / len) * 0.82 + 0.32, host[1] + (host[1] / len) * 0.82 - 0.28, host[2] + (i % 2 === 0 ? 0.45 : -0.45)),
          'single'
        );
      }
    }
  }

  return {
    key,
    formula,
    name: name || formula,
    structureType: 'covalent',
    geometryLabel: 'VSEPR 价层电子对互斥三维构型',
    atoms: b.atoms,
    bonds: b.bonds,
  };
}

function matchByChineseName(name: string): string | null {
  if (!name) return null;
  if (name.includes('去离子水') || name === '纯水' || name === '水') return 'H2O';
  if (name.includes('氯化钠') || name.includes('食盐')) return 'NaCl';
  if (name.includes('盐酸') || name.includes('氯化氢')) return 'HCl';
  if (name.includes('二氧化碳')) return 'CO2';
  if (name.includes('过氧化氢') || name.includes('双氧水')) return 'H2O2';
  if (name.includes('硫酸铜')) return 'CuSO4';
  if (name.includes('硫酸钡')) return 'BaSO4';
  if (name.includes('硫酸亚铁')) return 'FeSO4';
  if (name.includes('硫酸铁')) return 'Fe2(SO4)3';
  if (name.includes('硫酸钠')) return 'Na2SO4';
  if (name.includes('硫酸钾')) return 'K2SO4';
  if (name.includes('硫酸铝')) return 'Al2(SO4)3';
  if (name.includes('硫酸镁')) return 'MgSO4';
  if (name.includes('硫酸锌')) return 'ZnSO4';
  if (name.includes('硫酸锰')) return 'MnSO4';
  if (name.includes('稀硫酸') || name === '硫酸') return 'H2SO4';
  if (name.includes('氢氧化钠') || name.includes('烧碱')) return 'NaOH';
  if (name.includes('氢氧化钾')) return 'KOH';
  if (name.includes('氢氧化钙') || name.includes('石灰水')) return 'Ca(OH)2';
  if (name.includes('氢氧化铜')) return 'Cu(OH)2';
  if (name.includes('氢氧化亚铁')) return 'Fe(OH)2';
  if (name.includes('氢氧化铁')) return 'Fe(OH)3';
  if (name.includes('氢氧化铝')) return 'Al(OH)3';
  if (name.includes('碳酸氢钠') || name.includes('小苏打')) return 'NaHCO3';
  if (name.includes('碳酸氢钾')) return 'KHCO3';
  if (name.includes('碳酸钠') || name.includes('纯碱')) return 'Na2CO3';
  if (name.includes('碳酸钾')) return 'K2CO3';
  if (name.includes('碳酸钙')) return 'CaCO3';
  if (name.includes('高锰酸钾')) return 'KMnO4';
  if (name.includes('硝酸银')) return 'AgNO3';
  if (name.includes('氯化银')) return 'AgCl';
  if (name.includes('氯化铁')) return 'FeCl3';
  if (name.includes('氯化亚铁')) return 'FeCl2';
  if (name.includes('氯化铝')) return 'AlCl3';
  if (name.includes('氯化钡')) return 'BaCl2';
  if (name.includes('氯化钙')) return 'CaCl2';
  if (name.includes('氯化镁')) return 'MgCl2';
  if (name.includes('氯化锌')) return 'ZnCl2';
  if (name.includes('氯化铜')) return 'CuCl2';
  if (name.includes('稀硝酸') || name === '硝酸') return 'HNO3';
  if (name.includes('磷酸')) return 'H3PO4';
  if (name.includes('醋酸') || name.includes('乙酸')) return 'CH3COOH';
  if (name.includes('柠檬酸')) return 'C6H8O7';
  if (name.includes('葡萄糖') || name.includes('果糖')) return 'C6H12O6';
  if (name.includes('蔗糖') || name.includes('砂糖')) return 'C12H22O11';
  if (name.includes('咖啡因')) return 'C8H10N4O2';
  if (name.includes('酚酞')) return 'C20H14O4';
  if (name.includes('石蕊')) return 'Litmus';
  if (name.includes('氢气')) return 'H2';
  if (name.includes('氧气')) return 'O2';
  if (name.includes('溴')) return 'Br2';
  if (name.includes('碘化钾')) return 'KI';
  if (name.includes('碘单质') || name.includes('碘水')) return 'I2';
  return null;
}

/**
 * 根据化合物化学式与名称解析对应的三维分子或晶胞结构定义
 */
export function resolveMolecularStructure(rawFormula: string, rawName = ''): MolecularStructureDef {
  const norm = normalizeChemicalKey(rawFormula);
  const canonical = KEY_ALIASES[norm] ?? norm;

  // 1. 优先匹配显式离子（如 SO4_2-、CO3_2-、NO3-、OH-、Na+、Cl- 等）
  if (EXACT_BUILDERS[canonical]) {
    return EXACT_BUILDERS[canonical](rawFormula, rawName);
  }

  // 检查是否带电荷的单原子离子（如 Na⁺ -> Na+, Cu²⁺ -> Cu2+, Cl⁻ -> Cl-）
  if (/[+-]$/.test(canonical)) {
    const strippedIon = canonical.replace(/\d*[+-]$/, '');
    if (EXACT_BUILDERS[`${strippedIon}-`] || EXACT_BUILDERS[`${strippedIon}_2-`]) {
      const ionKey = EXACT_BUILDERS[`${strippedIon}-`] ? `${strippedIon}-` : `${strippedIon}_2-`;
      return EXACT_BUILDERS[ionKey](rawFormula, rawName);
    }
    if (/^[A-Z][a-z]?$/.test(strippedIon)) {
      const b = new StructureBuilder();
      b.addAtom(strippedIon, 0, 0, 0, rawFormula || canonical);
      return {
        key: canonical,
        formula: rawFormula || canonical,
        name: rawName || `${strippedIon}离子`,
        structureType: 'ion',
        geometryLabel: '水合离子量子化电子壳层构型',
        atoms: b.atoms,
        bonds: [],
        orbitalRings: 3,
      };
    }
  }

  // 2. 去除可能残留的电荷符号再查精确分子/盐表
  const neutralKey = KEY_ALIASES[canonical.replace(/[+-]/g, '')] ?? canonical.replace(/[+-]/g, '');
  if (EXACT_BUILDERS[neutralKey]) {
    return EXACT_BUILDERS[neutralKey](rawFormula, rawName);
  }

  // 3. 通过中文物质名称兜底匹配（如“石蕊试剂”、“小苏打”等）
  const byName = matchByChineseName(rawName);
  if (byName && EXACT_BUILDERS[byName]) {
    return EXACT_BUILDERS[byName](rawFormula || byName, rawName);
  }

  // 4. 通用 VSEPR 递归分子式构图算法
  return buildFallbackVSEPR(canonical || 'H2O', rawFormula || rawName || 'H₂O', rawName || rawFormula);
}

import * as THREE from 'three';

export const LAB_WALLS = {
  radius: 8.20,
  height: 3.90,
  faceRadius: 8.20,
  thickness: 0.040,
  bays: 16,
  joint: 0.0,
  doorAngle: 55 * Math.PI / 180,
  doorWidth: 1.80,
  doorHeight: 2.85,
  doorBottom: 0.0,
  panelBottom: 0.0,
  panelTop: 3.90,
  // 保持旧版接口兼容别名
  raisedDepth: 0.0,
  pierWidth: 0.16,
  grooveWidth: 0.0,
  grooveDepth: 0.0,
  contourSpacing: 0.050,
} as const;

export function createWallMaterials(): Record<string, THREE.Material> {
  return {
    // ── 参考图高精太空舱纯净冰灰/微晶冷调钛银墙面材质体系 ──

    // 1. 极简建筑圆弧护墙：完全对应参考图中的冷调太空舱纯净冰灰微晶科技质感
    wallWhite: new THREE.MeshStandardMaterial({
      color: 0xc4d1de,
      emissive: 0x182636,
      emissiveIntensity: 0.28,
      roughness: 0.38,
      metalness: 0.20,
      side: THREE.BackSide,
      envMapIntensity: 0.85,
    }),

    // 2. 哑光面板补充（供可能引用的旧接口保持安全，统一使用太空舱纯净冰灰）
    wallRaised: new THREE.MeshStandardMaterial({
      color: 0xc4d1de,
      emissive: 0x182636,
      emissiveIntensity: 0.28,
      roughness: 0.38,
      metalness: 0.20,
      side: THREE.BackSide,
      envMapIntensity: 0.85,
    }),

    // 3. 航天级阳极氧化喷砂银铝（结构兼容）
    mullionSilver: new THREE.MeshStandardMaterial({
      color: 0xeff4f9,
      roughness: 0.18,
      metalness: 0.90,
      envMapIntensity: 1.10,
    }),

    // 4. 镜面抛光 316L 不锈钢 / 液态铬（结构兼容）
    chromeSteel: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0.98,
      envMapIntensity: 1.30,
    }),

    // 5. 建筑阴角暗槽基底（结构兼容，深邃太空深影）
    wallSeamDark: new THREE.MeshBasicMaterial({ color: 0x121c28 }),

    // 6. 悬浮阴角踢脚暗槽（结构兼容）
    regletDark: new THREE.MeshStandardMaterial({
      color: 0x152230,
      roughness: 0.50,
      metalness: 0.45,
    }),

    // 7. 铝合金精密饰条（结构兼容）
    wallTrim: new THREE.MeshStandardMaterial({
      color: 0xedf3f8,
      roughness: 0.18,
      metalness: 0.88,
    }),
    aluminumTrim: new THREE.MeshStandardMaterial({
      color: 0xedf3f8,
      roughness: 0.18,
      metalness: 0.88,
    }),

    // ── 兼容性材质键（供旧版可能引用的组件保持安全） ──
    wallPanelReturn: new THREE.MeshStandardMaterial({ color: 0x1e2c3c, roughness: 0.42, metalness: 0.35 }),
    wallPanelSeam: new THREE.MeshBasicMaterial({ color: 0x121c28 }),
    wallGrooveBed: new THREE.MeshStandardMaterial({ color: 0x152230, roughness: 0.50, metalness: 0.45 }),
  };
}

/**
 * 创建极致平滑、纯净无缝的 360° 完整圆（平滑圆柱面护墙，无任何分缝或装饰）
 */
function createSmoothCircularWall(materials: Record<string, THREE.Material>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'apple-interior-white-cassettes';

  // 采用 256 细分极致平滑正圆柱面，连接地坪与天花，圆周无缝无棱角、无任何分缝与挂件
  const wallGeo = new THREE.CylinderGeometry(
    LAB_WALLS.radius,
    LAB_WALLS.radius,
    LAB_WALLS.height,
    256,
    1,
    true
  );
  wallGeo.translate(0, LAB_WALLS.height / 2, 0);

  const wallMesh = new THREE.Mesh(wallGeo, materials.wallWhite);
  wallMesh.name = 'wall-infill-faces';
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 兼容性占位节点，确保引用 wall-raised-faces 的逻辑安全
  const raisedPlaceholder = new THREE.Mesh(new THREE.BufferGeometry(), materials.wallRaised);
  raisedPlaceholder.name = 'wall-raised-faces';
  group.add(raisedPlaceholder);

  return group;
}

/**
 * 组装洁净纯白平滑完整圆墙面系统（无任何装饰，平滑无缝正圆）
 */
export function createLaboratoryWallPanels(materials: Record<string, THREE.Material>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'reference-wall-panels';

  // 1. 结构兼容占位节点
  const backingMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.wallSeamDark);
  backingMesh.name = 'wall-recessed-contour-beds';
  group.add(backingMesh);

  // 2. 极致平滑正圆无缝纯白护壁
  group.add(createSmoothCircularWall(materials));

  return group;
}

/**
 * 踢脚线系统：墙上无任何突出装饰或线条，保持平滑圆柱面直接连通地坪
 */
export function createLaboratoryBaseboard(materials: Record<string, THREE.Material>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'reference-baseboard';
  // 保持平滑完整的圆，隐藏任何外凸踢脚饰线
  group.visible = false;

  const shadowMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.regletDark);
  shadowMesh.name = 'reglet-shadow-gap-channel';
  group.add(shadowMesh);

  const shoeLipMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.chromeSteel);
  shoeLipMesh.name = 'profiled-wall-skirting';
  group.add(shoeLipMesh);

  return group;
}

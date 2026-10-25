import * as THREE from 'three';
import {
  anodizedAluminum,
  dialTexture,
  enameledCopper,
  labGlow,
  letterTexture,
  polishedGold,
  paintTexture,
} from './labKit.ts';
import { disposeObjectTree } from './disposeObject.ts';
import { ArticulatedHandSkeletonMesh } from './ArticulatedHandSkeletonMesh.ts';
import type {
  HandRuleConfig,
  HandRuleEvaluation,
  HandRuleMode,
  Polarity,
} from '../../physics/em/handRulesSolver.ts';
import type { HandGestureFrame } from '../../vision/types.ts';

/**
 * 创建带真实机械圆角与倒角的工业级实体几何体（严禁无倒角简单 BoxGeometry）
 */
function createChamferedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius = 0.008,
  bevel = 0.002
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.001, Math.min(radius, width * 0.4, depth * 0.4));
  const w = width * 0.5 - rx;
  const d = depth * 0.5 - rx;

  shape.moveTo(-w, -d - rx);
  shape.lineTo(w, -d - rx);
  shape.quadraticCurveTo(w + rx, -d - rx, w + rx, -d);
  shape.lineTo(w + rx, d);
  shape.quadraticCurveTo(w + rx, d + rx, w, d + rx);
  shape.lineTo(-w, d + rx);
  shape.quadraticCurveTo(-w - rx, d + rx, -w - rx, d);
  shape.lineTo(-w - rx, -d);
  shape.quadraticCurveTo(-w - rx, -d - rx, -w, -d - rx);

  const bSize = Math.min(rx * 0.6, bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.001, height - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height * 0.5, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建一体车削成型的高精度 3D 方向箭头几何体（沿 +Y 轴指向，起点在 y = -length/2，尖端在 y = +length/2）
 */
function createSculptedArrowGeometry(
  length = 0.12,
  shaftRadius = 0.0042,
  headRadius = 0.012,
  headLength = 0.032
): THREE.BufferGeometry {
  const half = length * 0.5;
  const neckY = half - headLength;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -half),
    new THREE.Vector2(shaftRadius * 1.35, -half + 0.003),
    new THREE.Vector2(shaftRadius, -half + 0.008),
    new THREE.Vector2(shaftRadius, neckY),
    new THREE.Vector2(headRadius, neckY),
    new THREE.Vector2(0.0, half),
  ];
  const geo = new THREE.LatheGeometry(profile, 24);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建车削成型的精密导体圆棒（带两端黄铜压紧阶梯轴肩与滚花槽环，沿 Y 轴，中心在原点）
 */
function createTurnedConductorGeometry(length = 0.24, radius = 0.009): THREE.BufferGeometry {
  const half = length * 0.5;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -half),
    new THREE.Vector2(radius * 1.28, -half + 0.003),
    new THREE.Vector2(radius * 1.28, -half + 0.018),
    new THREE.Vector2(radius * 0.92, -half + 0.022),
    new THREE.Vector2(radius, -half + 0.026),
    new THREE.Vector2(radius, half - 0.026),
    new THREE.Vector2(radius * 0.92, half - 0.022),
    new THREE.Vector2(radius * 1.28, half - 0.018),
    new THREE.Vector2(radius * 1.28, half - 0.003),
    new THREE.Vector2(0.0, half),
  ];
  const geo = new THREE.LatheGeometry(profile, 28);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建防振调平底座脚垫（沿 Y 轴）
 */
function createIsolationFootGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.022, 0.0),
    new THREE.Vector2(0.020, 0.006),
    new THREE.Vector2(0.014, 0.010),
    new THREE.Vector2(0.014, 0.018),
    new THREE.Vector2(0.0, 0.018),
  ];
  const geo = new THREE.LatheGeometry(profile, 24);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建正对操作者 (+Z) 的激光蚀刻毫米标尺纹理
 */
function createFrontScaleTexture(): THREE.CanvasTexture {
  return paintTexture(1024, 96, (ctx, w, h) => {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(2, 2, w - 4, h - 4);
    }

    const totalTicks = 40;
    for (let i = 0; i <= totalTicks; i++) {
      const x = 32 + ((w - 64) * i) / totalTicks;
      const isMajor = i % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(x, h - 6);
      ctx.lineTo(x, isMajor ? 22 : 46);
      ctx.strokeStyle = isMajor ? '#1e293b' : '#475569';
      ctx.lineWidth = isMajor ? 2.5 : 1.5;
      ctx.stroke();

      if (isMajor && typeof ctx.fillText === 'function') {
        const mmVal = (i - 20) * 10;
        ctx.fillStyle = mmVal === 0 ? '#0284c7' : '#334155';
        ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "SF Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${mmVal > 0 ? '+' : ''}${mmVal}`, x, 4);
      }
    }
  });
}

const _UP = new THREE.Vector3(0, 1, 0);
const _QUAT = new THREE.Quaternion();

/**
 * 电磁学三大定则（右手螺旋法则、左手定则、右手定则）纯 3D 导体与磁铁实验台
 * 严格遵循零弹窗、纯导体/磁铁实体建模、发光目标感应区与方向箭头引导规范
 */
export class HandRulesBenchMesh {
  public readonly group = new THREE.Group();
  public readonly handSkeleton: ArticulatedHandSkeletonMesh;

  // 三大定则独立 3D 机械总成
  private readonly screwGroup = new THREE.Group();
  private readonly leftRuleGroup = new THREE.Group();
  private readonly rightRuleGroup = new THREE.Group();

  // 导体周围发光目标引导区域
  private readonly targetZoneGroup = new THREE.Group();
  private targetRingMat!: THREE.MeshStandardMaterial;
  private targetInnerDiscMat!: THREE.MeshStandardMaterial;

  // 1. 右手螺旋法则组件
  private screwCurrentArrow!: THREE.Group;
  private readonly screwCurrentPulseRings: THREE.Mesh[] = [];
  private readonly screwMagFieldRingsGroup = new THREE.Group();
  private readonly screwMagChevrons: Array<{ group: THREE.Group; radius: number; baseAngle: number; y: number }> = [];
  private screwMagRingMat!: THREE.MeshStandardMaterial;
  private screwMagArrowMat!: THREE.MeshStandardMaterial;

  // 2. 左手定则组件
  private leftRodGroup = new THREE.Group();
  private leftCurrentArrow!: THREE.Group;
  private readonly leftCurrentPulses: THREE.Mesh[] = [];
  private readonly leftFieldArrows: THREE.Group[] = [];
  private leftForceArrow!: THREE.Group;
  private leftForceMat!: THREE.MeshStandardMaterial;
  private leftPoleTopMat!: THREE.MeshStandardMaterial;
  private leftPoleBottomMat!: THREE.MeshStandardMaterial;
  private leftPoleTopBadge!: THREE.Mesh;
  private leftPoleBottomBadge!: THREE.Mesh;
  private leftRodDisplacementX = 0;
  private leftRodVelocityX = 0;

  // 3. 右手定则组件
  private rightRodGroup = new THREE.Group();
  private rightMotionArrow!: THREE.Group;
  private readonly rightFieldArrows: THREE.Group[] = [];
  private rightInducedArrow!: THREE.Group;
  private rightInducedMat!: THREE.MeshStandardMaterial;
  private readonly rightInducedPulses: THREE.Mesh[] = [];
  private rightPoleFrontMat!: THREE.MeshStandardMaterial;
  private rightPoleBackMat!: THREE.MeshStandardMaterial;
  private rightGalvoNeedlePivot = new THREE.Group();
  private rightLoopGlowMat!: THREE.MeshStandardMaterial;
  private rightCutPhase = 0;

  // 共用高规格实验室材质
  private readonly satinSilverMat = anodizedAluminum(0xf1f5f9, 0.22);
  private readonly brushedSlateMat = anodizedAluminum(0xcbd5e1, 0.28);
  private readonly liquidChromeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.96,
    roughness: 0.08,
  });
  private readonly champagneBrassMat = polishedGold(0xf59e0b);
  private readonly pureCopperMat = enameledCopper(0xd97706);
  private readonly knownCurrentMat = labGlow(0xf59e0b, 0.68); // 琥珀金：已知电流 I
  private readonly knownFieldMat = labGlow(0x38bdf8, 0.62);   // 冰海青：已知磁场 B
  private readonly knownMotionMat = labGlow(0xa855f7, 0.65);  // 紫晶光：已知切割运动 v
  private readonly texN = letterTexture('N', '#fecaca');
  private readonly texS = letterTexture('S', '#bfdbfe');

  private animClock = 0;

  constructor() {
    this.group.name = 'HandRulesBenchMesh';

    this.buildIsolationBase();
    this.buildTargetGuidanceZone();
    this.buildRightHandScrewApparatus();
    this.buildLeftHandRuleApparatus();
    this.buildRightHandRuleApparatus();

    this.handSkeleton = new ArticulatedHandSkeletonMesh();
    this.group.add(this.handSkeleton.group);

    this.setMode('right-hand-screw');
  }

  /**
   * 1. 构建航天级喷砂银铝减振实验底座与正前方 (+Z) 激光蚀刻标尺
   */
  private buildIsolationBase(): void {
    const baseGroup = new THREE.Group();

    // 主承载台板（倒角铝板）
    const deckGeo = createChamferedBoxGeometry(0.62, 0.028, 0.38, 0.018, 0.003);
    const deckMesh = new THREE.Mesh(deckGeo, this.satinSilverMat);
    deckMesh.position.y = 0.018;
    deckMesh.receiveShadow = true;
    deckMesh.castShadow = true;
    baseGroup.add(deckMesh);

    // 上层精密内嵌绝缘平台
    const upperPadGeo = createChamferedBoxGeometry(0.54, 0.010, 0.30, 0.012, 0.0018);
    const upperPadMesh = new THREE.Mesh(upperPadGeo, this.brushedSlateMat);
    upperPadMesh.position.y = 0.044;
    upperPadMesh.receiveShadow = true;
    baseGroup.add(upperPadMesh);

    // 四角精密黄铜套环调平防振脚垫
    const footGeo = createIsolationFootGeometry();
    const footCoords: Array<[number, number]> = [
      [-0.26, -0.14],
      [0.26, -0.14],
      [-0.26, 0.14],
      [0.26, 0.14],
    ];
    for (const [fx, fz] of footCoords) {
      const foot = new THREE.Mesh(footGeo, this.brushedSlateMat);
      foot.position.set(fx, 0, fz);
      const brassRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.016, 0.002, 12, 24),
        this.champagneBrassMat
      );
      brassRing.rotation.x = Math.PI / 2;
      brassRing.position.set(fx, 0.009, fz);
      baseGroup.add(foot, brassRing);
    }

    // 正对操作者 (+Z) 的高精度激光蚀刻毫米刻度条
    const scalePlateGeo = createChamferedBoxGeometry(0.46, 0.014, 0.008, 0.002, 0.001);
    const scaleBezel = new THREE.Mesh(scalePlateGeo, this.champagneBrassMat);
    scaleBezel.position.set(0, 0.024, 0.191);
    baseGroup.add(scaleBezel);

    const scaleFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.011),
      new THREE.MeshBasicMaterial({ map: createFrontScaleTexture() })
    );
    scaleFace.position.set(0, 0.031, 0.196);
    baseGroup.add(scaleFace);

    this.group.add(baseGroup);
  }

  /**
   * 2. 构建导体周围的发光目标感应区域（引导手部骨骼靠近并摆出定则手势）
   */
  private buildTargetGuidanceZone(): void {
    this.targetRingMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      metalness: 0.3,
      roughness: 0.2,
      transparent: true,
      opacity: 0.78,
    });

    this.targetInnerDiscMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 外层精密双道发光感应环
    const outerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.0024, 16, 64),
      this.targetRingMat
    );
    const innerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.0014, 12, 48),
      this.targetRingMat
    );
    const discHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.025, 0.112, 48),
      this.targetInnerDiscMat
    );

    // 四个象限的精密倒角定位游标结节
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.0045, 16, 12),
        this.targetRingMat
      );
      node.position.set(Math.cos(angle) * 0.115, Math.sin(angle) * 0.115, 0);
      this.targetZoneGroup.add(node);
    }

    this.targetZoneGroup.add(outerHalo, innerHalo, discHalo);
    this.targetZoneGroup.position.set(0, 0.23, 0);
    this.group.add(this.targetZoneGroup);
  }

  /**
   * 3. 构建「右手螺旋法则（安培定则）」3D 通电直导线与环绕三维磁感线装置
   */
  private buildRightHandScrewApparatus(): void {
    this.screwGroup.name = 'RightHandScrewApparatus';

    // 左右双立柱镜面铬合金龙门支撑架
    const pillarGeo = createTurnedConductorGeometry(0.34, 0.008);
    const leftPillar = new THREE.Mesh(pillarGeo, this.liquidChromeMat);
    leftPillar.position.set(-0.18, 0.22, -0.05);
    const rightPillar = new THREE.Mesh(pillarGeo, this.liquidChromeMat);
    rightPillar.position.set(0.18, 0.22, -0.05);

    // 上下喷砂银铝横梁桥架
    const bridgeGeo = createChamferedBoxGeometry(0.42, 0.022, 0.12, 0.01, 0.002);
    const bottomYoke = new THREE.Mesh(bridgeGeo, this.satinSilverMat);
    bottomYoke.position.set(0, 0.054, -0.02);
    const topYoke = new THREE.Mesh(bridgeGeo, this.satinSilverMat);
    topYoke.position.set(0, 0.39, -0.02);

    // 中央竖直高纯紫铜通电直导线 (x=0, z=0, y 从 0.06 到 0.39)
    const wireGeo = createTurnedConductorGeometry(0.32, 0.0115);
    const centralWire = new THREE.Mesh(wireGeo, this.pureCopperMat);
    centralWire.position.set(0, 0.225, 0);

    // 上下端香槟金黄铜滚花锁紧螺母
    const nutGeo = new THREE.TorusGeometry(0.016, 0.0045, 14, 28);
    const bottomNut = new THREE.Mesh(nutGeo, this.champagneBrassMat);
    bottomNut.rotation.x = Math.PI / 2;
    bottomNut.position.set(0, 0.072, 0);
    const topNut = new THREE.Mesh(nutGeo, this.champagneBrassMat);
    topNut.rotation.x = Math.PI / 2;
    topNut.position.set(0, 0.378, 0);

    this.screwGroup.add(leftPillar, rightPillar, bottomYoke, topYoke, centralWire, bottomNut, topNut);

    // 沿导线流动的发光电流脉冲环（直观指示已知电流 I 流动方向）
    const pulseGeo = new THREE.TorusGeometry(0.0145, 0.0024, 12, 28);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(pulseGeo, this.knownCurrentMat);
      ring.rotation.x = Math.PI / 2;
      this.screwCurrentPulseRings.push(ring);
      this.screwGroup.add(ring);
    }

    // 已知电流方向 I 的立体指示大箭头（位于直导线左侧 x = -0.052）
    this.screwCurrentArrow = new THREE.Group();
    const iArrowMesh = new THREE.Mesh(
      createSculptedArrowGeometry(0.16, 0.0045, 0.013, 0.034),
      this.knownCurrentMat
    );
    this.screwCurrentArrow.add(iArrowMesh);
    this.screwCurrentArrow.position.set(-0.052, 0.225, 0.02);
    this.screwGroup.add(this.screwCurrentArrow);

    // 所求的环绕同心磁感线 B（右手螺旋对准后点亮并旋转流转）
    this.screwMagRingMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.75,
      metalness: 0.2,
      roughness: 0.15,
      transparent: true,
      opacity: 0.15,
    });
    this.screwMagArrowMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.85,
      metalness: 0.3,
      roughness: 0.15,
      transparent: true,
      opacity: 0.18,
    });

    const chevronGeo = createSculptedArrowGeometry(0.042, 0.0032, 0.0105, 0.024);
    const radii = [0.068, 0.108, 0.148];
    const heights = [0.175, 0.225, 0.275];

    for (const yLevel of heights) {
      for (let rIdx = 0; rIdx < radii.length; rIdx++) {
        const r = radii[rIdx];
        if (yLevel === 0.225 || rIdx === 1) {
          const torus = new THREE.Mesh(
            new THREE.TorusGeometry(r, 0.0022, 14, 64),
            this.screwMagRingMat
          );
          torus.rotation.x = Math.PI / 2;
          torus.position.set(0, yLevel, 0);
          this.screwMagFieldRingsGroup.add(torus);

          const count = rIdx === 0 ? 3 : 4;
          for (let k = 0; k < count; k++) {
            const baseAngle = (k * Math.PI * 2) / count + rIdx * 0.4;
            const chevGroup = new THREE.Group();
            const chevMesh = new THREE.Mesh(chevronGeo, this.screwMagArrowMat);
            chevGroup.add(chevMesh);
            this.screwMagFieldRingsGroup.add(chevGroup);
            this.screwMagChevrons.push({
              group: chevGroup,
              radius: r,
              baseAngle,
              y: yLevel,
            });
          }
        }
      }
    }

    this.screwGroup.add(this.screwMagFieldRingsGroup);
    this.group.add(this.screwGroup);
  }

  /**
   * 4. 构建「左手定则（安培力 F = I × B）」3D 匀强磁极 + 平行导轨 + 受力滑行导体棒装置
   */
  private buildLeftHandRuleApparatus(): void {
    this.leftRuleGroup.name = 'LeftHandRuleApparatus';

    // 1) 上下磁极与后侧 C 型航天银铝磁轭（产生竖直方向匀强磁场 B）
    const yokeBackGeo = createChamferedBoxGeometry(0.14, 0.34, 0.045, 0.01, 0.002);
    const yokeBack = new THREE.Mesh(yokeBackGeo, this.brushedSlateMat);
    yokeBack.position.set(0, 0.05, -0.125);
    this.leftRuleGroup.add(yokeBack);

    this.leftPoleBottomMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.55,
      roughness: 0.28,
    });
    this.leftPoleTopMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.55,
      roughness: 0.28,
    });

    const poleGeo = createChamferedBoxGeometry(0.16, 0.032, 0.18, 0.008, 0.002);
    const bottomPole = new THREE.Mesh(poleGeo, this.leftPoleBottomMat);
    bottomPole.position.set(0, 0.06, -0.02);
    const topPole = new THREE.Mesh(poleGeo, this.leftPoleTopMat);
    topPole.position.set(0, 0.35, -0.02);
    this.leftRuleGroup.add(bottomPole, topPole);

    // 磁极正前方 (+Z) N/S 极性标识铭牌
    const badgeGeo = new THREE.PlaneGeometry(0.026, 0.026);
    this.leftPoleBottomBadge = new THREE.Mesh(
      badgeGeo,
      new THREE.MeshBasicMaterial({ map: this.texN })
    );
    this.leftPoleBottomBadge.position.set(0, 0.076, 0.071);

    this.leftPoleTopBadge = new THREE.Mesh(
      badgeGeo,
      new THREE.MeshBasicMaterial({ map: this.texS })
    );
    this.leftPoleTopBadge.position.set(0, 0.366, 0.071);
    this.leftRuleGroup.add(this.leftPoleBottomBadge, this.leftPoleTopBadge);

    // 2) 已知匀强磁场 B 的竖直三维磁感线箭头阵列
    const bArrowGeo = createSculptedArrowGeometry(0.20, 0.0026, 0.0085, 0.024);
    const bOffsets: Array<[number, number]> = [
      [-0.048, -0.045],
      [0.048, -0.045],
      [-0.048, 0.025],
      [0.048, 0.025],
    ];
    for (const [bx, bz] of bOffsets) {
      const bArrowGroup = new THREE.Group();
      const bMesh = new THREE.Mesh(bArrowGeo, this.knownFieldMat);
      bArrowGroup.add(bMesh);
      bArrowGroup.position.set(bx, 0.21, bz);
      this.leftFieldArrows.push(bArrowGroup);
      this.leftRuleGroup.add(bArrowGroup);
    }

    // 3) 沿 X 轴水平左右舒展的双精密镜面铬合金平行导轨
    const railGeo = createTurnedConductorGeometry(0.46, 0.0055);
    railGeo.rotateZ(Math.PI / 2);
    const frontRail = new THREE.Mesh(railGeo, this.liquidChromeMat);
    frontRail.position.set(0, 0.195, 0.068);
    const backRail = new THREE.Mesh(railGeo, this.liquidChromeMat);
    backRail.position.set(0, 0.195, -0.088);
    this.leftRuleGroup.add(frontRail, backRail);

    // 导轨两端绝缘支撑立柱与香槟金接线柱
    const standoffGeo = createTurnedConductorGeometry(0.145, 0.007);
    for (const sx of [-0.215, 0.215]) {
      for (const sz of [-0.088, 0.068]) {
        const post = new THREE.Mesh(standoffGeo, this.satinSilverMat);
        post.position.set(sx, 0.122, sz);
        const cap = new THREE.Mesh(
          new THREE.TorusGeometry(0.009, 0.0025, 12, 24),
          this.champagneBrassMat
        );
        cap.rotation.x = Math.PI / 2;
        cap.position.set(sx, 0.198, sz);
        this.leftRuleGroup.add(post, cap);
      }
    }

    // 4) 架设在平行导轨上的可滑动通电导体棒 (沿 Z 轴横跨前后导轨)
    const rodGeo = createTurnedConductorGeometry(0.185, 0.0095);
    rodGeo.rotateX(Math.PI / 2);
    const rodMesh = new THREE.Mesh(rodGeo, this.pureCopperMat);
    this.leftRodGroup.add(rodMesh);

    // 导体棒上的已知电流方向 I 发光箭头与脉冲环
    this.leftCurrentArrow = new THREE.Group();
    const leftIMesh = new THREE.Mesh(
      createSculptedArrowGeometry(0.13, 0.004, 0.012, 0.03),
      this.knownCurrentMat
    );
    this.leftCurrentArrow.add(leftIMesh);
    this.leftCurrentArrow.position.set(0, 0.026, 0);
    this.leftRodGroup.add(this.leftCurrentArrow);

    const rodPulseGeo = new THREE.TorusGeometry(0.0125, 0.0022, 12, 24);
    for (let i = 0; i < 3; i++) {
      const pRing = new THREE.Mesh(rodPulseGeo, this.knownCurrentMat);
      this.leftCurrentPulses.push(pRing);
      this.leftRodGroup.add(pRing);
    }

    // 5) 所求的安培力矢量大箭头 F（当左手大拇指指向正确时高亮伸出并驱动导体棒滑行）
    this.leftForceMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.85,
      metalness: 0.3,
      roughness: 0.15,
      transparent: true,
      opacity: 0.18,
    });
    this.leftForceArrow = new THREE.Group();
    const fArrowMesh = new THREE.Mesh(
      createSculptedArrowGeometry(0.145, 0.0055, 0.015, 0.038),
      this.leftForceMat
    );
    this.leftForceArrow.add(fArrowMesh);
    this.leftForceArrow.position.set(0, 0, 0.01);
    this.leftRodGroup.add(this.leftForceArrow);

    this.leftRodGroup.position.set(0, 0.208, -0.01);
    this.leftRuleGroup.add(this.leftRodGroup);

    this.group.add(this.leftRuleGroup);
  }

  /**
   * 5. 构建「右手定则（电磁感应切割磁感线）」3D 水平切割导轨 + 闭合回路检流表装置
   */
  private buildRightHandRuleApparatus(): void {
    this.rightRuleGroup.name = 'RightHandRuleApparatus';

    // 1) 前后相对布置的磁极靴（产生沿 Z 轴穿入掌心的匀强磁场 B）
    this.rightPoleFrontMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.55,
      roughness: 0.28,
      transparent: true,
      opacity: 0.42, // 前侧极靴采用半透晶化处理，绝不遮挡内部切割导体棒视线
    });
    this.rightPoleBackMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.55,
      roughness: 0.28,
    });

    const backPoleMesh = new THREE.Mesh(
      createChamferedBoxGeometry(0.24, 0.20, 0.026, 0.008, 0.002),
      this.rightPoleBackMat
    );
    backPoleMesh.position.set(-0.04, 0.22, -0.095);

    const frontPoleFrame = new THREE.Mesh(
      createChamferedBoxGeometry(0.24, 0.022, 0.022, 0.005, 0.0015),
      this.rightPoleFrontMat
    );
    frontPoleFrame.position.set(-0.04, 0.095, 0.085);
    this.rightRuleGroup.add(backPoleMesh, frontPoleFrame);

    // 2) 已知磁场 B 方向箭头（沿 Z 轴穿入/穿出）
    const bArrowGeo = createSculptedArrowGeometry(0.13, 0.0028, 0.0085, 0.024);
    const gridPts: Array<[number, number]> = [
      [-0.11, 0.17],
      [0.03, 0.17],
      [-0.11, 0.27],
      [0.03, 0.27],
    ];
    for (const [gx, gy] of gridPts) {
      const bGrp = new THREE.Group();
      const bMesh = new THREE.Mesh(bArrowGeo, this.knownFieldMat);
      bGrp.add(bMesh);
      bGrp.position.set(gx, gy, -0.005);
      this.rightFieldArrows.push(bGrp);
      this.rightRuleGroup.add(bGrp);
    }

    // 3) 上下平行金属导轨（沿 X 轴延伸，右侧闭合接入精密微安检流计）
    const railGeo = createTurnedConductorGeometry(0.36, 0.0052);
    railGeo.rotateZ(Math.PI / 2);
    const bottomRail = new THREE.Mesh(railGeo, this.liquidChromeMat);
    bottomRail.position.set(-0.04, 0.115, 0);
    const topRail = new THREE.Mesh(railGeo, this.liquidChromeMat);
    topRail.position.set(-0.04, 0.325, 0);
    this.rightRuleGroup.add(bottomRail, topRail);

    // 左侧绝缘支柱
    const leftPost = new THREE.Mesh(
      createTurnedConductorGeometry(0.28, 0.0075),
      this.satinSilverMat
    );
    leftPost.position.set(-0.22, 0.19, 0);
    this.rightRuleGroup.add(leftPost);

    // 4) 右侧正对操作者 (+Z) 的精密中心零位检流计 (Galvanometer G)
    const galvoGroup = new THREE.Group();
    galvoGroup.position.set(0.20, 0.14, 0.02);

    const galvoHousing = new THREE.Mesh(
      createChamferedBoxGeometry(0.115, 0.135, 0.056, 0.01, 0.002),
      this.satinSilverMat
    );
    galvoGroup.add(galvoHousing);

    const dialFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.092, 0.088),
      new THREE.MeshBasicMaterial({ map: dialTexture() })
    );
    dialFace.position.set(0, 0.072, 0.029);
    galvoGroup.add(dialFace);

    // 检流计指针枢轴
    this.rightGalvoNeedlePivot.position.set(0, 0.048, 0.031);
    const needleMesh = new THREE.Mesh(
      createSculptedArrowGeometry(0.048, 0.0014, 0.0036, 0.010),
      new THREE.MeshBasicMaterial({ color: 0x34d399 })
    );
    needleMesh.position.y = 0.022;
    const pivotCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.004, 14, 12),
      this.champagneBrassMat
    );
    this.rightGalvoNeedlePivot.add(needleMesh, pivotCap);
    galvoGroup.add(this.rightGalvoNeedlePivot);

    // 顶部感应电流发光环座
    this.rightLoopGlowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
      metalness: 0.3,
      roughness: 0.2,
    });
    const beaconRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.018, 0.0032, 12, 28),
      this.rightLoopGlowMat
    );
    beaconRing.position.set(0, 0.15, 0);
    galvoGroup.add(beaconRing);
    this.rightRuleGroup.add(galvoGroup);

    // 5) 沿水平导轨持续做切割磁感线运动的竖直紫铜导体棒
    const vRodGeo = createTurnedConductorGeometry(0.215, 0.0095);
    const vRodMesh = new THREE.Mesh(vRodGeo, this.pureCopperMat);
    this.rightRodGroup.add(vRodMesh);

    // 已知切割运动速度方向 v 的发光紫晶箭头（水平向右 +X 或向左 -X）
    this.rightMotionArrow = new THREE.Group();
    const vArrowMesh = new THREE.Mesh(
      createSculptedArrowGeometry(0.115, 0.0042, 0.0125, 0.032),
      this.knownMotionMat
    );
    this.rightMotionArrow.add(vArrowMesh);
    this.rightMotionArrow.position.set(0, 0, 0.025);
    this.rightRodGroup.add(this.rightMotionArrow);

    // 所求的感应电流方向箭头 I_ind（当右手四指指向正确时高亮发光）
    this.rightInducedMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.88,
      metalness: 0.3,
      roughness: 0.15,
      transparent: true,
      opacity: 0.16,
    });
    this.rightInducedArrow = new THREE.Group();
    const indArrowMesh = new THREE.Mesh(
      createSculptedArrowGeometry(0.165, 0.0048, 0.0135, 0.034),
      this.rightInducedMat
    );
    this.rightInducedArrow.add(indArrowMesh);
    this.rightInducedArrow.position.set(-0.028, 0, 0.018);
    this.rightRodGroup.add(this.rightInducedArrow);

    const indPulseGeo = new THREE.TorusGeometry(0.013, 0.0024, 12, 24);
    for (let i = 0; i < 3; i++) {
      const pRing = new THREE.Mesh(indPulseGeo, this.rightInducedMat);
      pRing.rotation.x = Math.PI / 2;
      this.rightInducedPulses.push(pRing);
      this.rightRodGroup.add(pRing);
    }

    this.rightRodGroup.position.set(-0.04, 0.22, 0);
    this.rightRuleGroup.add(this.rightRodGroup);

    this.group.add(this.rightRuleGroup);
  }

  public setMode(mode: HandRuleMode): void {
    this.screwGroup.visible = mode === 'right-hand-screw';
    this.leftRuleGroup.visible = mode === 'left-hand-rule';
    this.rightRuleGroup.visible = mode === 'right-hand-rule';

    if (mode === 'right-hand-screw') {
      this.targetZoneGroup.position.set(0, 0.225, 0.02);
      this.targetZoneGroup.rotation.set(0, 0, 0);
    } else if (mode === 'left-hand-rule') {
      this.targetZoneGroup.position.set(0, 0.21, 0.02);
      this.targetZoneGroup.rotation.set(0, 0, 0);
      this.leftRodDisplacementX = 0;
      this.leftRodVelocityX = 0;
    } else {
      this.targetZoneGroup.position.set(-0.04, 0.22, 0.025);
      this.targetZoneGroup.rotation.set(0, 0, 0);
      this.rightCutPhase = 0;
    }
  }

  public resetMotion(): void {
    this.leftRodDisplacementX = 0;
    this.leftRodVelocityX = 0;
    this.rightCutPhase = 0;
  }

  /**
   * 每帧更新实验台三维物理动画、方向箭头与手部骨骼
   */
  public update(
    delta: number,
    config: HandRuleConfig,
    evaluation: HandRuleEvaluation,
    frame: HandGestureFrame | null
  ): void {
    const dt = Math.max(0.001, Math.min(0.05, delta));
    this.animClock += dt;

    // 1. 更新 3D 素雅手部骨骼
    this.handSkeleton.update(dt, frame, evaluation);

    // 2. 更新导体周围的发光目标感应区域颜色与呼吸脉动
    const pulse = 0.5 + 0.5 * Math.sin(this.animClock * 4.2);
    const scalePulse = 1.0 + 0.035 * Math.sin(this.animClock * 3.2);
    this.targetZoneGroup.scale.set(scalePulse, scalePulse, 1);

    if (evaluation.status === 'wrong-hand') {
      this.targetRingMat.color.setHex(0xfbbf24);
      this.targetRingMat.emissive.setHex(0xf59e0b);
      this.targetRingMat.emissiveIntensity = 0.65 + pulse * 0.25;
      this.targetInnerDiscMat.color.setHex(0xf59e0b);
      this.targetInnerDiscMat.opacity = 0.22;
    } else if (evaluation.isMatched) {
      this.targetRingMat.color.setHex(0x34d399);
      this.targetRingMat.emissive.setHex(0x10b981);
      this.targetRingMat.emissiveIntensity = 0.78 + pulse * 0.22;
      this.targetInnerDiscMat.color.setHex(0x34d399);
      this.targetInnerDiscMat.opacity = 0.24;
    } else {
      this.targetRingMat.color.setHex(0x38bdf8);
      this.targetRingMat.emissive.setHex(0x0284c7);
      this.targetRingMat.emissiveIntensity = 0.45 + evaluation.alignmentScore * 0.35 + pulse * 0.15;
      this.targetInnerDiscMat.color.setHex(0x38bdf8);
      this.targetInnerDiscMat.opacity = 0.12 + evaluation.alignmentScore * 0.1;
    }

    // 3. 更新当前激活定则的 3D 物理组件
    if (config.mode === 'right-hand-screw') {
      this.updateRightHandScrew(dt, config.currentPolarity, evaluation);
    } else if (config.mode === 'left-hand-rule') {
      this.updateLeftHandRule(dt, config, evaluation);
    } else {
      this.updateRightHandRule(dt, config, evaluation);
    }
  }

  private updateRightHandScrew(
    dt: number,
    currentPolarity: Polarity,
    evaluation: HandRuleEvaluation
  ): void {
    // 1) 已知电流方向大箭头 (+Y 向上 / -Y 向下)
    this.screwCurrentArrow.rotation.z = currentPolarity > 0 ? 0 : Math.PI;

    // 沿导线流动的发光电流脉冲环
    for (let i = 0; i < this.screwCurrentPulseRings.length; i++) {
      const phase = ((this.animClock * 0.85 * currentPolarity + i / this.screwCurrentPulseRings.length) % 1 + 1) % 1;
      const y = 0.085 + phase * 0.28;
      this.screwCurrentPulseRings[i].position.set(0, y, 0);
    }

    // 2) 所求的环绕磁场 B：当右手螺旋手势正确时高亮显现并高速环绕流转
    const targetOpacity = evaluation.isMatched
      ? 0.92
      : 0.12 + evaluation.alignmentScore * 0.45;
    this.screwMagRingMat.opacity += (targetOpacity - this.screwMagRingMat.opacity) * Math.min(1, dt * 8);
    this.screwMagArrowMat.opacity = this.screwMagRingMat.opacity;

    const angularSpeed = (evaluation.isMatched ? 2.6 : 0.45) * evaluation.screwCirculationSign;
    for (const item of this.screwMagChevrons) {
      item.baseAngle += angularSpeed * dt;
      // 俯视逆时针 (+1): x = r * sin(theta), z = r * cos(theta)
      const x = Math.sin(item.baseAngle) * item.radius;
      const z = Math.cos(item.baseAngle) * item.radius;
      item.group.position.set(x, item.y, z);

      // 切线方向矢量: dx/dtheta = cos(theta), dz/dtheta = -sin(theta)，乘以旋转符号
      const tx = Math.cos(item.baseAngle) * evaluation.screwCirculationSign;
      const tz = -Math.sin(item.baseAngle) * evaluation.screwCirculationSign;
      const tangent = new THREE.Vector3(tx, 0, tz).normalize();
      _QUAT.setFromUnitVectors(_UP, tangent);
      item.group.quaternion.copy(_QUAT);
    }
  }

  private updateLeftHandRule(
    dt: number,
    config: HandRuleConfig,
    evaluation: HandRuleEvaluation
  ): void {
    // 1) 磁场方向 B (+Y 向上：下 N 上 S；-Y 向下：上 N 下 S)
    const by = config.fieldPolarity;
    this.leftPoleBottomMat.color.setHex(by > 0 ? 0xef4444 : 0x3b82f6);
    this.leftPoleTopMat.color.setHex(by > 0 ? 0x3b82f6 : 0xef4444);
    (this.leftPoleBottomBadge.material as THREE.MeshBasicMaterial).map = by > 0 ? this.texN : this.texS;
    (this.leftPoleTopBadge.material as THREE.MeshBasicMaterial).map = by > 0 ? this.texS : this.texN;

    for (const bArr of this.leftFieldArrows) {
      bArr.rotation.z = by > 0 ? 0 : Math.PI;
    }

    // 2) 已知电流方向 I (沿导体棒 -Z 或 +Z)
    const iz = -config.currentPolarity; // +1 时向里 (-Z)，-1 时向外 (+Z)
    _QUAT.setFromUnitVectors(_UP, new THREE.Vector3(0, 0, iz));
    this.leftCurrentArrow.quaternion.copy(_QUAT);

    for (let i = 0; i < this.leftCurrentPulses.length; i++) {
      const phase = ((this.animClock * 0.9 * iz + i / this.leftCurrentPulses.length) % 1 + 1) % 1;
      const zPos = -0.075 + phase * 0.15;
      this.leftCurrentPulses[i].position.set(0, 0, zPos);
    }

    // 3) 所求的安培力方向 F (沿导轨 +X 向右 或 -X 向左)
    const fx = evaluation.targetVectorDir.x >= 0 ? 1 : -1;
    _QUAT.setFromUnitVectors(_UP, new THREE.Vector3(fx, 0, 0));
    this.leftForceArrow.quaternion.copy(_QUAT);
    this.leftForceArrow.position.set(fx * 0.078, 0, 0.01);

    const targetForceOpacity = evaluation.isMatched
      ? 0.96
      : 0.10 + evaluation.alignmentScore * 0.45;
    this.leftForceMat.opacity += (targetForceOpacity - this.leftForceMat.opacity) * Math.min(1, dt * 8);

    // 当左手大拇指指向正确时，导体棒在安培力 F 作用下沿导轨真实加速滑行
    if (evaluation.isMatched) {
      const targetLimitX = fx * 0.135;
      this.leftRodVelocityX += fx * 0.28 * dt;
      this.leftRodDisplacementX += this.leftRodVelocityX * dt;
      if (Math.abs(this.leftRodDisplacementX) >= Math.abs(targetLimitX)) {
        // 到达导轨行程末端后平滑归位并再次受安培力推出，形成清晰连贯的受力运动观察
        this.leftRodDisplacementX = targetLimitX;
        this.leftRodVelocityX = 0;
        if (Math.sin(this.animClock * 3.0) < -0.85) {
          this.leftRodDisplacementX = 0;
        }
      }
    } else {
      // 未匹配时平滑回中
      this.leftRodVelocityX = 0;
      this.leftRodDisplacementX += (0 - this.leftRodDisplacementX) * Math.min(1, dt * 6);
    }

    this.leftRodGroup.position.x = this.leftRodDisplacementX;
    this.targetZoneGroup.position.x = this.leftRodDisplacementX * 0.5;
  }

  private updateRightHandRule(
    dt: number,
    config: HandRuleConfig,
    evaluation: HandRuleEvaluation
  ): void {
    // 1) 已知磁场 B (沿 Z 轴穿入 -Z 或穿出 +Z)
    const bz = -config.fieldPolarity;
    _QUAT.setFromUnitVectors(_UP, new THREE.Vector3(0, 0, bz));
    for (const bGrp of this.rightFieldArrows) {
      bGrp.quaternion.copy(_QUAT);
    }

    // 2) 已知导体棒切割磁感线运动方向 v (+X 向右 或 -X 向左)
    const vx = config.motionPolarity;
    _QUAT.setFromUnitVectors(_UP, new THREE.Vector3(vx, 0, 0));
    this.rightMotionArrow.quaternion.copy(_QUAT);
    this.rightMotionArrow.position.set(vx * 0.062, 0, 0.025);

    // 导体棒沿切割速度 v 方向持续平稳切割磁感线
    this.rightCutPhase = (this.rightCutPhase + dt * 0.55) % 1;
    const sweepOffset = (this.rightCutPhase - 0.5) * 0.18 * vx;
    this.rightRodGroup.position.x = -0.04 + sweepOffset;

    // 3) 所求的感应电流方向 I_ind (+Y 向上 或 -Y 向下)
    const indY = evaluation.targetVectorDir.y >= 0 ? 1 : -1;
    this.rightInducedArrow.rotation.z = indY > 0 ? 0 : Math.PI;

    const targetIndOpacity = evaluation.isMatched
      ? 0.96
      : 0.10 + evaluation.alignmentScore * 0.45;
    this.rightInducedMat.opacity += (targetIndOpacity - this.rightInducedMat.opacity) * Math.min(1, dt * 8);

    for (let i = 0; i < this.rightInducedPulses.length; i++) {
      const phase = ((this.animClock * 1.15 * indY + i / this.rightInducedPulses.length) % 1 + 1) % 1;
      const yPos = -0.085 + phase * 0.17;
      this.rightInducedPulses[i].position.set(0, yPos, 0);
      this.rightInducedPulses[i].visible = evaluation.isMatched || evaluation.alignmentScore > 0.35;
    }

    // 4) 检流计指针偏转与发光反馈
    const targetNeedleAngle = evaluation.isMatched ? -indY * 0.62 : -indY * evaluation.alignmentScore * 0.18;
    this.rightGalvoNeedlePivot.rotation.z +=
      (targetNeedleAngle - this.rightGalvoNeedlePivot.rotation.z) * Math.min(1, dt * 8);

    this.rightLoopGlowMat.color.setHex(evaluation.isMatched ? 0x34d399 : 0x38bdf8);
    this.rightLoopGlowMat.emissive.setHex(evaluation.isMatched ? 0x10b981 : 0x0284c7);
    this.rightLoopGlowMat.emissiveIntensity = evaluation.isMatched ? 0.85 : 0.2;
  }

  public dispose(): void {
    this.handSkeleton.dispose();
    this.texN.dispose();
    this.texS.dispose();
    disposeObjectTree(this.group);
  }
}

import * as THREE from 'three';
import {
  anodizedAluminum,
  labGlass,
  labMetal,
  polishedGold,
} from '../em/labKit.ts';
import { disposeObjectTree } from '../em/disposeObject.ts';
import {
  type PhaseChangeTelemetry,
} from '../../physics/thermo/phaseChangeSolver.ts';

export type PhaseChangeInteractRole =
  | 'toggle-left-lamp'
  | 'toggle-right-lamp'
  | 'toggle-channel-1'
  | 'toggle-channel-2';

/**
 * 创建带真实机械圆角与倒角的水平底座/腔体几何体
 * 严格保证：X 居中 [-width/2, +width/2]，Z 居中 [-depth/2, +depth/2]，
 * 底部位于 Y = 0，顶部位于 Y = height
 */
function createChamferedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.002
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.0006, Math.min(radius, width * 0.45, depth * 0.45));
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

  const bSize = Math.min(rx * 0.5, bevel, height * 0.35);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.0008, height - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  });
  geo.center();
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height * 0.5, 0);
  return geo;
}

/**
 * 创建面向 +Z、中心位于 (0, 0, 0) 的精密倒角圆角矩形几何体
 */
function createFrontFacingRoundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.0016
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.0006, Math.min(radius, width * 0.45, height * 0.45));
  const w = width * 0.5 - rx;
  const h = height * 0.5 - rx;

  shape.moveTo(-w, -h - rx);
  shape.lineTo(w, -h - rx);
  shape.quadraticCurveTo(w + rx, -h - rx, w + rx, -h);
  shape.lineTo(w + rx, h);
  shape.quadraticCurveTo(w + rx, h + rx, w, h + rx);
  shape.lineTo(-w, h + rx);
  shape.quadraticCurveTo(-w - rx, h + rx, -w - rx, h);
  shape.lineTo(-w - rx, -h);
  shape.quadraticCurveTo(-w - rx, -h - rx, -w, -h - rx);

  const bSize = Math.min(rx * 0.45, bevel, depth * 0.35);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.0008, depth - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  });
  geo.center();
  return geo;
}

/**
 * 创建工业六角螺母几何体（中心在原点，轴向沿 Y）
 */
function createHexNutGeometry(flatRadius: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = Math.cos(angle) * flatRadius;
    const y = Math.sin(angle) * flatRadius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const bevel = Math.min(height * 0.2, flatRadius * 0.15);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.0004, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.center();
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * 创建有机水滴形酒精灯火焰旋转几何体
 */
function createFlameTeardropGeometry(radius: number, height: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * height;
    const profile = Math.sin(t * Math.PI) * Math.pow(1 - t, 0.52) * 1.42;
    const r = Math.max(0.0001, radius * profile);
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 24);
}

/**
 * 创建带防滑滚花凹槽的调节手轮总成（轴向沿 X 轴）
 */
function createKnurledKnobGroup(
  radius: number,
  thickness: number,
  knobMat: THREE.Material,
  brassMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, thickness, 24),
    knobMat
  );
  hub.rotation.z = Math.PI / 2;
  g.add(hub);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, thickness * 1.45, 18),
    brassMat
  );
  collar.rotation.z = Math.PI / 2;
  g.add(collar);

  const grooveGeo = new THREE.BoxGeometry(thickness * 0.92, radius * 0.22, radius * 0.22);
  const grooveCount = 12;
  for (let i = 0; i < grooveCount; i++) {
    const a = (i / grooveCount) * Math.PI * 2;
    const rib = new THREE.Mesh(grooveGeo, knobMat);
    rib.position.set(0, Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.92);
    rib.rotation.x = -a;
    g.add(rib);
  }
  return g;
}

interface CrystalGranuleState {
  baseX: number;
  baseY: number;
  baseZ: number;
  baseScaleX: number;
  baseScaleY: number;
  baseScaleZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  meltOrder: number; // 0~1，外层与下部优先融化
}

interface BathBubbleState {
  radius: number;
  angle: number;
  yFrac: number;
  speed: number;
  phase: number;
  size: number;
}

interface WaxLumpState {
  mesh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  baseScaleX: number;
  baseScaleY: number;
  baseScaleZ: number;
}

interface AlcoholLampVisual {
  group: THREE.Group;
  flameGroup: THREE.Group;
  flameOuterMesh: THREE.Mesh;
  flameMidMesh: THREE.Mesh;
  flameCoreMesh: THREE.Mesh;
  flameOuterMat: THREE.MeshBasicMaterial;
  flameMidMat: THREE.MeshBasicMaterial;
  flameCoreMat: THREE.MeshBasicMaterial;
  flameLight: THREE.PointLight;
  gauzeGlowMat: THREE.MeshBasicMaterial;
  wickTipMat: THREE.MeshStandardMaterial;
  intensity: number;
}

/**
 * 晶体与非晶体物态相变与潜热 (Crystalline vs. Amorphous Phase Transition & Latent Heat)
 * 高精细度 3D 实验台与多通道温度采集器总成
 */
export class PhaseChangeBenchMesh {
  public readonly group = new THREE.Group();

  // 核心可交互分组
  public readonly standAndHeatingGroup = new THREE.Group();
  public readonly leftAlcoholLampGroup = new THREE.Group();
  public readonly rightAlcoholLampGroup = new THREE.Group();
  public readonly collectorGroup = new THREE.Group();
  public readonly channel1ButtonGroup = new THREE.Group();
  public readonly channel2ButtonGroup = new THREE.Group();

  // 几何布局坐标常量 (m)
  public static readonly STAND_BASE_TOP_Y = 0.028;
  public static readonly LEFT_STATION_X = -0.215; // 通道1：晶体（冰晶）水浴中心 X
  public static readonly RIGHT_STATION_X = -0.048; // 通道2：非晶体（石蜡）水浴中心 X
  public static readonly COLLECTOR_CENTER_X = 0.195; // 右侧多通道温度采集器中心 X
  public static readonly TRIPOD_TOP_Y = 0.140; // 三脚架顶环上表面 Y
  public static readonly GAUZE_TOP_Y = 0.144; // 石棉网上表面 Y
  public static readonly BEAKER_BOTTOM_Y = 0.144; // 烧杯底面 Y
  public static readonly TEST_TUBE_BOTTOM_Y = 0.158; // 试管内腔底部 Y
  public static readonly CROSSBAR_Y = 0.292; // 横梁中心高度 Y

  // 酒精灯火焰视觉状态
  private leftLampVisual!: AlcoholLampVisual;
  private rightLampVisual!: AlcoholLampVisual;

  // 左试管（晶体·冰晶）动态相变组件
  private crystalInstancedMesh!: THREE.InstancedMesh;
  private crystalGranules: CrystalGranuleState[] = [];
  private crystalLiquidColumnMesh!: THREE.Mesh;
  private crystalLiquidMeniscusMesh!: THREE.Mesh;
  private crystalLiquidMat!: THREE.MeshPhysicalMaterial;

  // 右试管（非晶体·石蜡）动态软化组件
  private waxMainColumnMesh!: THREE.Mesh;
  private waxMeniscusMesh!: THREE.Mesh;
  private waxMaterial!: THREE.MeshPhysicalMaterial;
  private waxLumps: WaxLumpState[] = [];
  private waxBubblesInstanced!: THREE.InstancedMesh;
  private waxBubbleStates: BathBubbleState[] = [];

  // 左右水浴烧杯液面与受热对流微气泡
  private leftBathWaterTopDisc!: THREE.Mesh;
  private rightBathWaterTopDisc!: THREE.Mesh;
  private leftBathBubblesInstanced!: THREE.InstancedMesh;
  private rightBathBubblesInstanced!: THREE.InstancedMesh;
  private leftBathBubbleStates: BathBubbleState[] = [];
  private rightBathBubbleStates: BathBubbleState[] = [];

  // 多通道温度采集器动态屏幕与实体按键
  private collectorCanvas!: HTMLCanvasElement;
  private collectorTexture!: THREE.CanvasTexture;
  private lastScreenKey = '';
  private channel1BtnMesh!: THREE.Mesh;
  private channel2BtnMesh!: THREE.Mesh;
  private channel1BtnMat!: THREE.MeshStandardMaterial;
  private channel2BtnMat!: THREE.MeshStandardMaterial;

  private readonly dummyMatrix = new THREE.Matrix4();
  private readonly dummyPos = new THREE.Vector3();
  private readonly dummyQuat = new THREE.Quaternion();
  private readonly dummyScale = new THREE.Vector3();
  private readonly dummyEuler = new THREE.Euler();
  private animClock = 0;

  constructor() {
    this.group.name = 'PhaseChangeBenchGroup';

    this.buildRetortStandAndClamps();
    this.buildTripodsAndWireGauzes();
    this.leftLampVisual = this.buildAlcoholLamp(
      PhaseChangeBenchMesh.LEFT_STATION_X,
      this.leftAlcoholLampGroup,
      'toggle-left-lamp'
    );
    this.rightLampVisual = this.buildAlcoholLamp(
      PhaseChangeBenchMesh.RIGHT_STATION_X,
      this.rightAlcoholLampGroup,
      'toggle-right-lamp'
    );
    this.buildWaterBathBeakers();
    this.buildTestTubesAndSamples();
    this.buildTemperatureProbesAndCables();
    this.buildMultiChannelCollector();

    this.group.add(
      this.standAndHeatingGroup,
      this.leftAlcoholLampGroup,
      this.rightAlcoholLampGroup,
      this.collectorGroup
    );
  }

  /**
   * 1. 构建左侧重型铁架台底座、镜面不锈钢立柱、十字夹、横梁与双路精密试管夹
   */
  private buildRetortStandAndClamps(): void {
    // 铁架台底座：航天级太空银灰阳极氧化铝合金 + 镜面液态铬倒角边饰（严格遵循反脏黑材质铁律）
    const baseSlateMat = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      metalness: 0.65,
      roughness: 0.22,
      clearcoat: 0.45,
      clearcoatRoughness: 0.15,
    });
    const satinSilverMat = anodizedAluminum(0xe2e8f0, 0.22);
    const chromeMat = labMetal(0xffffff, 0.06);
    const clampGreyMat = anodizedAluminum(0x94a3b8, 0.24);
    const knobSlateMat = anodizedAluminum(0x64748b, 0.28);
    const brassMat = polishedGold(0xf59e0b);
    const footPadMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.65,
      metalness: 0.22,
    });

    const standCenterX = -0.155;
    const baseWidth = 0.39;
    const baseDepth = 0.185;
    const baseHeight = PhaseChangeBenchMesh.STAND_BASE_TOP_Y;

    // 主配重底座
    const basePlate = new THREE.Mesh(
      createChamferedBoxGeometry(baseWidth, baseHeight - 0.004, baseDepth, 0.012, 0.0025),
      baseSlateMat
    );
    basePlate.position.set(standCenterX, 0.004, 0);
    basePlate.castShadow = true;
    basePlate.receiveShadow = true;
    this.standAndHeatingGroup.add(basePlate);

    // 底座顶面高亮拉丝银铝防滑装饰垫板
    const topInlay = new THREE.Mesh(
      createChamferedBoxGeometry(baseWidth - 0.022, 0.0022, baseDepth - 0.022, 0.008, 0.0008),
      anodizedAluminum(0xf1f5f9, 0.2)
    );
    topInlay.position.set(standCenterX, baseHeight - 0.001, 0);
    this.standAndHeatingGroup.add(topInlay);

    // 四角调平减振脚垫
    const footXOffsets = [-baseWidth * 0.43, baseWidth * 0.43];
    const footZOffsets = [-baseDepth * 0.4, baseDepth * 0.4];
    for (const fx of footXOffsets) {
      for (const fz of footZOffsets) {
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.016, 0.006, 20),
          footPadMat
        );
        foot.position.set(standCenterX + fx, 0.003, fz);
        this.standAndHeatingGroup.add(foot);
      }
    }

    // 左侧垂直 316L 镜面抛光立柱 (X = -0.318)
    const pillarX = -0.318;
    const pillarHeight = 0.375;

    // 立柱底座法兰与六角锁紧螺母
    const flangeCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.019, 0.012, 28),
      satinSilverMat
    );
    flangeCollar.position.set(pillarX, baseHeight + 0.006, 0);
    this.standAndHeatingGroup.add(flangeCollar);

    const flangeNut = new THREE.Mesh(createHexNutGeometry(0.013, 0.007), brassMat);
    flangeNut.position.set(pillarX, baseHeight + 0.014, 0);
    this.standAndHeatingGroup.add(flangeNut);

    const verticalRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0075, 0.0075, pillarHeight, 28),
      chromeMat
    );
    verticalRod.position.set(pillarX, baseHeight + pillarHeight * 0.5, 0);
    verticalRod.castShadow = true;
    this.standAndHeatingGroup.add(verticalRod);

    // 立柱顶端球面车削圆帽
    const rodTopCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.0076, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      chromeMat
    );
    rodTopCap.position.set(pillarX, baseHeight + pillarHeight, 0);
    this.standAndHeatingGroup.add(rodTopCap);

    // 十字夹头 (Bosshead) 与水平横梁 (Y = 0.292)
    const crossbarY = PhaseChangeBenchMesh.CROSSBAR_Y;
    const bossheadBody = new THREE.Mesh(
      createChamferedBoxGeometry(0.028, 0.036, 0.028, 0.005, 0.0015),
      clampGreyMat
    );
    bossheadBody.position.set(pillarX, crossbarY - 0.018, 0);
    this.standAndHeatingGroup.add(bossheadBody);

    // 十字夹左侧滚花锁紧手轮
    const leftThumbwheel = createKnurledKnobGroup(0.014, 0.011, knobSlateMat, brassMat);
    leftThumbwheel.position.set(pillarX - 0.022, crossbarY, 0);
    this.standAndHeatingGroup.add(leftThumbwheel);

    // 水平镜面不锈钢横梁 (从 X = -0.332 延伸至 X = +0.002)
    const crossbarStartX = -0.332;
    const crossbarEndX = 0.002;
    const crossbarLen = crossbarEndX - crossbarStartX;
    const crossbarMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0058, 0.0058, crossbarLen, 24),
      chromeMat
    );
    crossbarMesh.rotation.z = Math.PI / 2;
    crossbarMesh.position.set((crossbarStartX + crossbarEndX) * 0.5, crossbarY, 0);
    crossbarMesh.castShadow = true;
    this.standAndHeatingGroup.add(crossbarMesh);

    // 两个精密双爪试管夹总成（分别抱持左、右试管）
    const stationXs = [
      PhaseChangeBenchMesh.LEFT_STATION_X,
      PhaseChangeBenchMesh.RIGHT_STATION_X,
    ];
    stationXs.forEach((sx, idx) => {
      const clampGroup = new THREE.Group();
      clampGroup.position.set(sx, crossbarY, 0);

      // 滑块夹座主体
      const block = new THREE.Mesh(
        createChamferedBoxGeometry(0.042, 0.028, 0.034, 0.005, 0.0014),
        clampGreyMat
      );
      block.position.set(0, -0.014, 0);
      clampGroup.add(block);

      // 前后弧形抱爪与防滑硅胶内衬
      const jawRadius = 0.0165;
      const jawTube = 0.0038;
      const frontJaw = new THREE.Mesh(
        new THREE.TorusGeometry(jawRadius, jawTube, 14, 24, Math.PI * 0.82),
        satinSilverMat
      );
      frontJaw.rotation.x = Math.PI / 2;
      frontJaw.rotation.z = Math.PI * 0.09;
      clampGroup.add(frontJaw);

      const backJaw = new THREE.Mesh(
        new THREE.TorusGeometry(jawRadius, jawTube, 14, 24, Math.PI * 0.82),
        satinSilverMat
      );
      backJaw.rotation.x = Math.PI / 2;
      backJaw.rotation.z = Math.PI * 1.09;
      clampGroup.add(backJaw);

      // 右试管夹外侧配备带滚花锁紧手轮（还原参考图右侧横梁末端的旋钮）
      if (idx === 1) {
        const rightKnob = createKnurledKnobGroup(0.0135, 0.010, knobSlateMat, brassMat);
        rightKnob.position.set(0.032, 0, 0);
        clampGroup.add(rightKnob);
      }

      this.standAndHeatingGroup.add(clampGroup);
    });
  }

  /**
   * 2. 构建左右两座不锈钢加热三脚架与精细编织石棉网/陶土网
   */
  private buildTripodsAndWireGauzes(): void {
    const tripodSteelMat = anodizedAluminum(0xcbd5e1, 0.22);
    const topRingMat = labMetal(0xffffff, 0.08);
    const chromeRimMat = labMetal(0xffffff, 0.06);
    const gauzeTex = this.createWireGauzeTexture();
    const gauzeMeshMat = new THREE.MeshStandardMaterial({
      map: gauzeTex,
      roughness: 0.35,
      metalness: 0.35,
    });
    const ceramicDiscMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      roughness: 0.82,
      metalness: 0.02,
    });

    const stationXs = [
      PhaseChangeBenchMesh.LEFT_STATION_X,
      PhaseChangeBenchMesh.RIGHT_STATION_X,
    ];
    const baseTopY = PhaseChangeBenchMesh.STAND_BASE_TOP_Y;
    const tripodTopY = PhaseChangeBenchMesh.TRIPOD_TOP_Y;

    for (const sx of stationXs) {
      const tripodGroup = new THREE.Group();
      tripodGroup.position.set(sx, 0, 0);

      // 顶部承托圆环（镜面液态铬不锈钢）
      const topRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.052, 0.0038, 16, 36),
        topRingMat
      );
      topRing.rotation.x = Math.PI / 2;
      topRing.position.y = tripodTopY - 0.0038;
      tripodGroup.add(topRing);

      // 四根向外微倾的精密支撑腿（航天银铝）
      const legAngles = [
        Math.PI * 0.22,
        Math.PI * 0.78,
        Math.PI * 1.22,
        Math.PI * 1.78,
      ];
      for (const ang of legAngles) {
        const topPt = new THREE.Vector3(
          Math.cos(ang) * 0.049,
          tripodTopY - 0.004,
          Math.sin(ang) * 0.049
        );
        const botPt = new THREE.Vector3(
          Math.cos(ang) * 0.062,
          baseTopY + 0.002,
          Math.sin(ang) * 0.062
        );
        const legCurve = new THREE.LineCurve3(botPt, topPt);
        const legMesh = new THREE.Mesh(
          new THREE.TubeGeometry(legCurve, 8, 0.0032, 12, false),
          tripodSteelMat
        );
        legMesh.castShadow = true;
        tripodGroup.add(legMesh);

        // 支腿底部防滑脚套（镜面液态铬）
        const footCap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0048, 0.0054, 0.006, 14),
          chromeRimMat
        );
        footCap.position.set(botPt.x, baseTopY + 0.003, botPt.z);
        tripodGroup.add(footCap);
      }

      // 石棉网/陶土网（压边不锈钢方框 + 亮银编织丝网与洁白耐火陶土匀热芯）
      const gauzeW = 0.122;
      const gauzeH = 0.0032;

      // 1. 阳极氧化银铝基座底板
      const gauzePlate = new THREE.Mesh(
        createChamferedBoxGeometry(gauzeW, gauzeH, gauzeW, 0.006, 0.001),
        anodizedAluminum(0xe2e8f0, 0.25)
      );
      gauzePlate.position.set(0, tripodTopY, 0);
      tripodGroup.add(gauzePlate);

      // 2. 精密不锈钢经纬编织丝网高清纹理顶面（标准 [0, 1] UV 映射，彻底解决 UV 截断黑化问题）
      const gauzeTopMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(gauzeW - 0.002, gauzeW - 0.002),
        gauzeMeshMat
      );
      gauzeTopMesh.rotation.x = -Math.PI / 2;
      gauzeTopMesh.position.y = tripodTopY + gauzeH + 0.0001;
      tripodGroup.add(gauzeTopMesh);

      // 3. 洁白高岭土耐火陶土匀热实体圆盘（正对烧杯底面，提供纯净专业的实验视觉）
      const ceramicDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0435, 0.044, 0.0006, 48),
        ceramicDiscMat
      );
      ceramicDisc.position.y = tripodTopY + gauzeH + 0.0004;
      tripodGroup.add(ceramicDisc);

      // 4. 石棉网四周冲压卷边镜面金属框
      const rimThickness = 0.0042;
      const rimFrame = new THREE.Mesh(
        new THREE.BoxGeometry(gauzeW + 0.002, rimThickness, gauzeW + 0.002),
        chromeRimMat
      );
      rimFrame.position.set(0, tripodTopY + gauzeH * 0.5, 0);
      // 仅保留边缘微凸压边，让顶部丝网与陶土露出
      rimFrame.scale.set(1, 0.55, 1);
      tripodGroup.add(rimFrame);

      this.standAndHeatingGroup.add(tripodGroup);
    }
  }

  /**
   * 3. 构建单盏高硼硅玻璃酒精灯（含内部酒精液面、浸液棉芯、黄铜灯头、三层真实火焰与碰撞体）
   */
  private buildAlcoholLamp(
    centerX: number,
    targetGroup: THREE.Group,
    interactRole: PhaseChangeInteractRole
  ): AlcoholLampVisual {
    targetGroup.position.set(centerX, PhaseChangeBenchMesh.STAND_BASE_TOP_Y, 0);
    targetGroup.userData.interactRole = interactRole;

    const glassMat = labGlass(0.16);
    const alcoholLiquidMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.42,
      roughness: 0.08,
      metalness: 0.0,
      transmission: 0.72,
      ior: 1.36,
      depthWrite: false,
    });
    const brassMat = polishedGold(0xf59e0b);
    const ceramicNozzleMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.08,
    });
    const wickCordMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      roughness: 0.85,
      metalness: 0.02,
    });
    const wickTipMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      emissive: 0xd97706,
      emissiveIntensity: 0.65,
      roughness: 0.75,
    });

    // 酒精灯重型玻璃瓶身旋转剖面 (高度 0 ~ 0.056m)
    const lampPts: THREE.Vector2[] = [
      new THREE.Vector2(0.0001, 0.000),
      new THREE.Vector2(0.034, 0.000),
      new THREE.Vector2(0.037, 0.005),
      new THREE.Vector2(0.038, 0.026),
      new THREE.Vector2(0.035, 0.036),
      new THREE.Vector2(0.017, 0.044),
      new THREE.Vector2(0.015, 0.054),
      new THREE.Vector2(0.012, 0.054),
      new THREE.Vector2(0.012, 0.042),
      new THREE.Vector2(0.032, 0.033),
      new THREE.Vector2(0.033, 0.006),
      new THREE.Vector2(0.0001, 0.006),
    ];
    const lampBodyMesh = new THREE.Mesh(new THREE.LatheGeometry(lampPts, 36), glassMat);
    lampBodyMesh.userData.interactRole = interactRole;
    targetGroup.add(lampBodyMesh);

    // 酒精灯底座金属承托环
    const baseCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0365, 0.0375, 0.006, 32),
      anodizedAluminum(0x334155, 0.28)
    );
    baseCollar.position.y = 0.003;
    baseCollar.userData.interactRole = interactRole;
    targetGroup.add(baseCollar);

    // 内部透明酒精液体与液面弯月面
    const alcoholCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0315, 0.0315, 0.022, 28),
      alcoholLiquidMat
    );
    alcoholCol.position.y = 0.017;
    targetGroup.add(alcoholCol);

    const alcoholMeniscus = new THREE.Mesh(
      new THREE.RingGeometry(0.003, 0.0315, 28),
      new THREE.MeshBasicMaterial({
        color: 0xf0f9ff,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    alcoholMeniscus.rotation.x = -Math.PI / 2;
    alcoholMeniscus.position.y = 0.0281;
    targetGroup.add(alcoholMeniscus);

    // 浸在酒精内的编织棉芯绳
    const wickCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.016, 0.008, 0.006),
      new THREE.Vector3(-0.005, 0.016, 0.002),
      new THREE.Vector3(0.0, 0.038, 0.0),
      new THREE.Vector3(0.0, 0.068, 0.0),
    ]);
    const wickCord = new THREE.Mesh(
      new THREE.TubeGeometry(wickCurve, 20, 0.0028, 10, false),
      wickCordMat
    );
    targetGroup.add(wickCord);

    // 香槟金黄铜灯头套管与防滑滚花压环
    const brassBurnerSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0145, 0.016, 0.016, 28),
      brassMat
    );
    brassBurnerSleeve.position.y = 0.056;
    brassBurnerSleeve.userData.interactRole = interactRole;
    targetGroup.add(brassBurnerSleeve);

    const ceramicWickNozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.0085, 0.007, 24),
      ceramicNozzleMat
    );
    ceramicWickNozzle.position.y = 0.066;
    ceramicWickNozzle.userData.interactRole = interactRole;
    targetGroup.add(ceramicWickNozzle);

    const wickTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0024, 0.003, 0.007, 14),
      wickTipMat
    );
    wickTip.position.y = 0.071;
    wickTip.userData.interactRole = interactRole;
    targetGroup.add(wickTip);

    // 三层真实酒精灯火焰（外焰橙红、中焰明黄、焰心淡蓝）
    // 严格限制火焰高度（最高尖端在石棉网底面下方 ~6mm 处自然舔舐），杜绝穿透石棉网或侵入烧杯底部造成闪烁
    const flameGroup = new THREE.Group();
    flameGroup.position.set(0, 0.0735, 0);

    const flameOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flameMidMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flameCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfff7ed,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const flameOuterMesh = new THREE.Mesh(
      createFlameTeardropGeometry(0.0105, 0.030),
      flameOuterMat
    );
    const flameMidMesh = new THREE.Mesh(
      createFlameTeardropGeometry(0.0072, 0.022),
      flameMidMat
    );
    flameMidMesh.position.y = 0.001;
    const flameCoreMesh = new THREE.Mesh(
      createFlameTeardropGeometry(0.0040, 0.013),
      flameCoreMat
    );
    flameCoreMesh.position.y = 0.0015;

    flameGroup.add(flameOuterMesh, flameMidMesh, flameCoreMesh);
    targetGroup.add(flameGroup);

    // 石棉网底面受热红橙光晕圆盘
    const gauzeGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const gauzeGlowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.028, 28), gauzeGlowMat);
    gauzeGlowDisc.rotation.x = Math.PI / 2;
    gauzeGlowDisc.position.y =
      PhaseChangeBenchMesh.TRIPOD_TOP_Y - PhaseChangeBenchMesh.STAND_BASE_TOP_Y - 0.0005;
    targetGroup.add(gauzeGlowDisc);

    // 火焰动态暖光点光源（平缓自然呼吸微光，避免高频频闪照亮烧杯底面）
    const flameLight = new THREE.PointLight(0xff8c1a, 0.75, 0.28, 2.0);
    flameLight.position.set(0, 0.082, 0.0);
    targetGroup.add(flameLight);

    // 透明点击拾取包络体（方便用户轻松点击酒精灯任意部位点火/熄灭）
    const hitCollider = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, 0.105, 18),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitCollider.position.y = 0.052;
    hitCollider.userData.interactRole = interactRole;
    targetGroup.add(hitCollider);

    return {
      group: targetGroup,
      flameGroup,
      flameOuterMesh,
      flameMidMesh,
      flameCoreMesh,
      flameOuterMat,
      flameMidMat,
      flameCoreMat,
      flameLight,
      gauzeGlowMat,
      wickTipMat,
      intensity: 1.0,
    };
  }

  /**
   * 4. 构建左右两只高硼硅水浴烧杯（带卷边杯口、刻度线、正面标签「晶体(冰晶)」「非晶体(石蜡)」、水浴液面与对流微气泡）
   */
  private buildWaterBathBeakers(): void {
    // 高透实验室纯净高硼硅物理玻璃材质（清漆镜面高光、纯白高透、无反面法线倒置发黑阴影）
    const beakerGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.02,
      metalness: 0.02,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.20,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    // 高清纯净水浴介质（清澈透亮，剔除透射帧缓冲模糊造成的灰暗浑浊）
    const bathWaterMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f9ff,
      transparent: true,
      opacity: 0.20,
      roughness: 0.03,
      metalness: 0.0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.04,
      side: THREE.FrontSide,
      depthWrite: false,
    });

    const beakerRadius = 0.046;
    const beakerHeight = 0.114;
    const waterFillHeight = 0.080;
    const beakerBottomY = PhaseChangeBenchMesh.BEAKER_BOTTOM_Y;

    // 烧杯玻璃旋转剖面（内外底角均引入精密切线光滑圆弧过渡，彻底消除 90 度折角法线均化产生的发黑阴影晕圈）
    const wallThick = 0.0022;
    const bottomThick = 0.0035;
    const innerRadius = beakerRadius - wallThick;

    const beakerPts: THREE.Vector2[] = [
      new THREE.Vector2(0.0001, bottomThick),
      new THREE.Vector2(innerRadius - 0.004, bottomThick),
      new THREE.Vector2(innerRadius - 0.0012, bottomThick + 0.0016),
      new THREE.Vector2(innerRadius, bottomThick + 0.0045),
      new THREE.Vector2(innerRadius, beakerHeight - 0.004),
      new THREE.Vector2(innerRadius + 0.0018, beakerHeight),
      new THREE.Vector2(beakerRadius + 0.0022, beakerHeight),
      new THREE.Vector2(beakerRadius, beakerHeight - 0.003),
      new THREE.Vector2(beakerRadius, 0.0045),
      new THREE.Vector2(beakerRadius - 0.0012, 0.0016),
      new THREE.Vector2(beakerRadius - 0.004, 0.0),
      new THREE.Vector2(0.0001, 0.0),
    ];
    const beakerGeo = new THREE.LatheGeometry(beakerPts, 48);

    const configs = [
      {
        x: PhaseChangeBenchMesh.LEFT_STATION_X,
        title: '晶体',
        subtitle: '(冰晶)',
        isLeft: true,
      },
      {
        x: PhaseChangeBenchMesh.RIGHT_STATION_X,
        title: '非晶体',
        subtitle: '(石蜡)',
        isLeft: false,
      },
    ];

    for (const cfg of configs) {
      const bGroup = new THREE.Group();
      bGroup.position.set(cfg.x, beakerBottomY, 0);

      // 玻璃烧杯壁
      const glassMesh = new THREE.Mesh(beakerGeo, beakerGlassMat);
      glassMesh.renderOrder = 4;
      bGroup.add(glassMesh);

      // 烧杯内部水浴液柱（环形避开中心试管；采用 openEnded=true 杜绝底面与玻璃杯底、顶面与弯月面重叠 Z-fighting）
      const waterColumn = new THREE.Mesh(
        new THREE.CylinderGeometry(
          beakerRadius - 0.0028,
          beakerRadius - 0.0028,
          waterFillHeight,
          36,
          1,
          true
        ),
        bathWaterMat
      );
      waterColumn.position.y = 0.0035 + waterFillHeight * 0.5;
      waterColumn.renderOrder = 2;
      bGroup.add(waterColumn);

      // 水浴自由液面弯月面圆环
      const waterTopDisc = new THREE.Mesh(
        new THREE.RingGeometry(0.0138, beakerRadius - 0.0028, 36),
        new THREE.MeshPhysicalMaterial({
          color: 0xf0f9ff,
          transparent: true,
          opacity: 0.48,
          roughness: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      waterTopDisc.rotation.x = -Math.PI / 2;
      waterTopDisc.position.y = 0.0035 + waterFillHeight;
      waterTopDisc.renderOrder = 3;
      bGroup.add(waterTopDisc);

      if (cfg.isLeft) {
        this.leftBathWaterTopDisc = waterTopDisc;
      } else {
        this.rightBathWaterTopDisc = waterTopDisc;
      }

      // 烧杯正面弧面白底标签贴纸（正对 +Z 操作者视线）
      const labelTex = this.createBeakerLabelTexture(cfg.title, cfg.subtitle);
      const labelMat = new THREE.MeshStandardMaterial({
        map: labelTex,
        roughness: 0.35,
        metalness: 0.02,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const labelAngleSpan = 0.68;
      const labelMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
          beakerRadius + 0.0005,
          beakerRadius + 0.0005,
          0.026,
          24,
          1,
          true,
          -labelAngleSpan * 0.5,
          labelAngleSpan
        ),
        labelMat
      );
      labelMesh.position.y = 0.082;
      labelMesh.renderOrder = 5;
      bGroup.add(labelMesh);

      // 水浴受热上升对流微气泡 (InstancedMesh)
      const bubbleCount = 36;
      const bubbleGeo = new THREE.SphereGeometry(1, 10, 8);
      const bubbleMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      });
      const bubblesInst = new THREE.InstancedMesh(bubbleGeo, bubbleMat, bubbleCount);
      bubblesInst.renderOrder = 3;
      bGroup.add(bubblesInst);

      const states: BathBubbleState[] = [];
      for (let i = 0; i < bubbleCount; i++) {
        states.push({
          radius: 0.017 + Math.random() * 0.024,
          angle: Math.random() * Math.PI * 2,
          yFrac: Math.random(),
          speed: 0.32 + Math.random() * 0.45,
          phase: Math.random() * Math.PI * 2,
          size: 0.0009 + Math.random() * 0.0012,
        });
      }

      if (cfg.isLeft) {
        this.leftBathBubblesInstanced = bubblesInst;
        this.leftBathBubbleStates = states;
      } else {
        this.rightBathBubblesInstanced = bubblesInst;
        this.rightBathBubbleStates = states;
      }

      this.standAndHeatingGroup.add(bGroup);
    }
  }

  /**
   * 5. 构建浸没于水浴中央的左右两支玻璃试管及内部真实宏观相变样品：
   *    - 左管：晶体（冰晶多面体颗粒群 + 固液共存上升清澈液面）
   *    - 右管：非晶体（石蜡连续浑浊软化柱体 + 内部缓慢上浮微气泡）
   */
  private buildTestTubesAndSamples(): void {
    const tubeGlassMat = labGlass(0.14);
    const tubeRadius = 0.0132;
    const tubeBottomY = PhaseChangeBenchMesh.TEST_TUBE_BOTTOM_Y;
    const tubeHeight = 0.162;

    // 圆底玻璃试管旋转剖面
    const tubePts: THREE.Vector2[] = [];
    const bottomSteps = 10;
    for (let i = 0; i <= bottomSteps; i++) {
      const a = (i / bottomSteps) * (Math.PI * 0.5);
      const r = Math.max(0.0001, Math.sin(a) * tubeRadius);
      const y = (1 - Math.cos(a)) * tubeRadius;
      tubePts.push(new THREE.Vector2(r, y));
    }
    tubePts.push(new THREE.Vector2(tubeRadius, tubeHeight - 0.003));
    tubePts.push(new THREE.Vector2(tubeRadius + 0.0018, tubeHeight));
    tubePts.push(new THREE.Vector2(tubeRadius - 0.0008, tubeHeight));
    tubePts.push(new THREE.Vector2(tubeRadius - 0.0016, tubeHeight - 0.003));
    for (let i = bottomSteps; i >= 0; i--) {
      const a = (i / bottomSteps) * (Math.PI * 0.5);
      const r = Math.max(0.0001, Math.sin(a) * (tubeRadius - 0.0016));
      const y = 0.0016 + (1 - Math.cos(a)) * (tubeRadius - 0.0016);
      tubePts.push(new THREE.Vector2(r, y));
    }
    const testTubeGeo = new THREE.LatheGeometry(tubePts, 32);

    // ==================== 5A. 左管：晶体（冰晶）====================
    const leftTubeGroup = new THREE.Group();
    leftTubeGroup.position.set(PhaseChangeBenchMesh.LEFT_STATION_X, tubeBottomY, 0);

    const leftGlassMesh = new THREE.Mesh(testTubeGeo, tubeGlassMat);
    leftGlassMesh.renderOrder = 3;
    leftTubeGroup.add(leftGlassMesh);

    // 晶体熔化生成的清澈液体柱 (随 meltFraction 从底部上升)
    this.crystalLiquidMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.48,
      roughness: 0.06,
      metalness: 0.0,
      transmission: 0.85,
      ior: 1.35,
      depthWrite: false,
    });
    const maxSampleHeight = 0.064;
    this.crystalLiquidColumnMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeRadius - 0.0022, tubeRadius - 0.0024, maxSampleHeight, 28),
      this.crystalLiquidMat
    );
    this.crystalLiquidColumnMesh.position.y = 0.004 + maxSampleHeight * 0.5;
    this.crystalLiquidColumnMesh.renderOrder = 2;
    leftTubeGroup.add(this.crystalLiquidColumnMesh);

    this.crystalLiquidMeniscusMesh = new THREE.Mesh(
      new THREE.CircleGeometry(tubeRadius - 0.0022, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
      })
    );
    this.crystalLiquidMeniscusMesh.rotation.x = -Math.PI / 2;
    this.crystalLiquidMeniscusMesh.position.y = 0.006;
    this.crystalLiquidMeniscusMesh.renderOrder = 2;
    leftTubeGroup.add(this.crystalLiquidMeniscusMesh);

    // 冰晶多面体颗粒群 (InstancedMesh，共 52 颗棱角分明的半透明晶粒紧密堆积)
    const granuleCount = 52;
    const granuleGeo = new THREE.DodecahedronGeometry(0.0038, 0);
    const granuleMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      emissive: 0xe2e8f0,
      emissiveIntensity: 0.18,
      roughness: 0.22,
      metalness: 0.04,
      transmission: 0.55,
      transparent: true,
      opacity: 0.92,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    });
    this.crystalInstancedMesh = new THREE.InstancedMesh(granuleGeo, granuleMat, granuleCount);
    this.crystalInstancedMesh.renderOrder = 2;
    leftTubeGroup.add(this.crystalInstancedMesh);

    for (let i = 0; i < granuleCount; i++) {
      const layer = Math.floor(i / 6);
      const idxInLayer = i % 6;
      const yBase = 0.007 + layer * 0.0066 + (idxInLayer % 2) * 0.0022;
      const radialDist =
        idxInLayer === 0
          ? 0.0012
          : 0.0052 + ((i * 7) % 5) * 0.0008;
      const theta = idxInLayer * ((Math.PI * 2) / 5) + layer * 0.65;
      const bx = Math.cos(theta) * Math.min(0.0078, radialDist);
      const bz = Math.sin(theta) * Math.min(0.0078, radialDist);

      // 靠近外壁与底部的晶粒优先受热融化，核心晶粒保留到潜热段末期
      const radialNorm = Math.sqrt(bx * bx + bz * bz) / 0.008;
      const meltOrder = Math.max(0.05, Math.min(0.98, 1.0 - radialNorm * 0.45 - (1 - layer / 9) * 0.35));

      this.crystalGranules.push({
        baseX: bx,
        baseY: Math.min(0.062, yBase),
        baseZ: bz,
        baseScaleX: 0.82 + ((i * 13) % 7) * 0.06,
        baseScaleY: 0.78 + ((i * 17) % 7) * 0.06,
        baseScaleZ: 0.85 + ((i * 19) % 7) * 0.06,
        rotX: (i * 1.1) % Math.PI,
        rotY: (i * 1.7) % Math.PI,
        rotZ: (i * 2.3) % Math.PI,
        meltOrder,
      });
    }

    this.standAndHeatingGroup.add(leftTubeGroup);

    // ==================== 5B. 右管：非晶体（石蜡）====================
    const rightTubeGroup = new THREE.Group();
    rightTubeGroup.position.set(PhaseChangeBenchMesh.RIGHT_STATION_X, tubeBottomY, 0);

    const rightGlassMesh = new THREE.Mesh(testTubeGeo, tubeGlassMat);
    rightGlassMesh.renderOrder = 3;
    rightTubeGroup.add(rightGlassMesh);

    // 石蜡主体（初始为半透明微黄乳白硬质蜡柱，随升温连续变清澈粘稠液体）
    this.waxMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xfef9ee,
      roughness: 0.48,
      metalness: 0.02,
      transmission: 0.45,
      transparent: true,
      opacity: 0.88,
      ior: 1.44,
      clearcoat: 0.4,
      depthWrite: false,
    });

    const waxHeight = 0.064;
    this.waxMainColumnMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeRadius - 0.0022, tubeRadius - 0.0024, waxHeight, 28),
      this.waxMaterial
    );
    this.waxMainColumnMesh.position.y = 0.004 + waxHeight * 0.5;
    this.waxMainColumnMesh.renderOrder = 2;
    rightTubeGroup.add(this.waxMainColumnMesh);

    this.waxMeniscusMesh = new THREE.Mesh(
      new THREE.CircleGeometry(tubeRadius - 0.0022, 28),
      this.waxMaterial
    );
    this.waxMeniscusMesh.rotation.x = -Math.PI / 2;
    this.waxMeniscusMesh.position.y = 0.004 + waxHeight;
    this.waxMeniscusMesh.renderOrder = 2;
    rightTubeGroup.add(this.waxMeniscusMesh);

    // 固态石蜡内部的不规则蜡块棱块（随软化度上升逐渐坍缩融合进粘稠流体中）
    const lumpGeo = new THREE.IcosahedronGeometry(0.0045, 0);
    for (let i = 0; i < 16; i++) {
      const lumpMesh = new THREE.Mesh(lumpGeo, this.waxMaterial);
      const ly = 0.010 + (i / 16) * 0.052;
      const la = i * 1.85;
      const lr = (i % 3) * 0.0024;
      const lx = Math.cos(la) * lr;
      const lz = Math.sin(la) * lr;
      const sx = 0.9 + (i % 4) * 0.15;
      const sy = 1.1 + (i % 3) * 0.18;
      const sz = 0.9 + ((i + 1) % 4) * 0.15;
      lumpMesh.position.set(lx, ly, lz);
      lumpMesh.scale.set(sx, sy, sz);
      lumpMesh.rotation.set(i * 0.7, i * 1.2, i * 0.5);
      lumpMesh.renderOrder = 2;
      rightTubeGroup.add(lumpMesh);
      this.waxLumps.push({
        mesh: lumpMesh,
        baseX: lx,
        baseY: ly,
        baseZ: lz,
        baseScaleX: sx,
        baseScaleY: sy,
        baseScaleZ: sz,
      });
    }

    // 石蜡内部包裹的微小气泡（还原参考图右管石蜡中的细密透明微泡）
    const waxBubbleCount = 32;
    const waxBubbleGeo = new THREE.SphereGeometry(1, 10, 8);
    const waxBubbleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.waxBubblesInstanced = new THREE.InstancedMesh(
      waxBubbleGeo,
      waxBubbleMat,
      waxBubbleCount
    );
    this.waxBubblesInstanced.renderOrder = 2;
    rightTubeGroup.add(this.waxBubblesInstanced);

    for (let i = 0; i < waxBubbleCount; i++) {
      this.waxBubbleStates.push({
        radius: 0.0015 + Math.random() * 0.0072,
        angle: Math.random() * Math.PI * 2,
        yFrac: 0.08 + Math.random() * 0.86,
        speed: 0.08 + Math.random() * 0.16,
        phase: Math.random() * Math.PI * 2,
        size: 0.0008 + Math.random() * 0.0013,
      });
    }

    this.standAndHeatingGroup.add(rightTubeGroup);
  }

  /**
   * 6. 构建插入左右试管的精密不锈钢温度探头与自然垂坠弯曲连接至右侧采集器的传感器线缆
   */
  private buildTemperatureProbesAndCables(): void {
    const probeSteelMat = labMetal(0xffffff, 0.08);
    const probeHandleMat = anodizedAluminum(0x1e293b, 0.28);
    const brassNutMat = polishedGold(0xf59e0b);
    const cableJacketMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.25,
    });

    const stationXs = [
      PhaseChangeBenchMesh.LEFT_STATION_X,
      PhaseChangeBenchMesh.RIGHT_STATION_X,
    ];

    stationXs.forEach((sx) => {
      // 插入试管底部样品中心的精密不锈钢感温探针杆 (Y: 0.172 -> 0.340)
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0022, 0.0022, 0.168, 18),
        probeSteelMat
      );
      shaft.position.set(sx, 0.256, 0);
      this.standAndHeatingGroup.add(shaft);

      // 试管口密封导套与黄铜锁紧压帽
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.010, 20),
        brassNutMat
      );
      collar.position.set(sx, 0.324, 0);
      this.standAndHeatingGroup.add(collar);

      // 上部黑色/深钛灰圆柱形传感器手柄 (Y: 0.330 -> 0.382)
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0082, 0.0082, 0.052, 24),
        probeHandleMat
      );
      handle.position.set(sx, 0.356, 0);
      handle.castShadow = true;
      this.standAndHeatingGroup.add(handle);

      const handleTopCone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0045, 0.0082, 0.012, 24),
        probeHandleMat
      );
      handleTopCone.position.set(sx, 0.388, 0);
      this.standAndHeatingGroup.add(handleTopCone);

      // 顶部防折应力护套
      const strainBoot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0032, 0.0046, 0.016, 16),
        probeHandleMat
      );
      strainBoot.position.set(sx, 0.401, 0);
      this.standAndHeatingGroup.add(strainBoot);
    });

    // 两条优雅弧形悬垂传感器线缆（从左/右探头顶部拱起并自然汇入右侧采集器顶部的航空插头）
    const collectorTopY = 0.192;
    const port1X = PhaseChangeBenchMesh.COLLECTOR_CENTER_X - 0.048;
    const port3X = PhaseChangeBenchMesh.COLLECTOR_CENTER_X + 0.045;

    const cable1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(PhaseChangeBenchMesh.LEFT_STATION_X, 0.408, 0),
      new THREE.Vector3(PhaseChangeBenchMesh.LEFT_STATION_X + 0.025, 0.455, -0.008),
      new THREE.Vector3(-0.075, 0.415, -0.012),
      new THREE.Vector3(0.045, 0.310, -0.008),
      new THREE.Vector3(port1X - 0.012, 0.245, -0.004),
      new THREE.Vector3(port1X, collectorTopY + 0.022, 0),
    ]);
    const cable1Mesh = new THREE.Mesh(
      new THREE.TubeGeometry(cable1Curve, 48, 0.0026, 12, false),
      cableJacketMat
    );
    cable1Mesh.castShadow = true;
    this.standAndHeatingGroup.add(cable1Mesh);

    const cable2Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(PhaseChangeBenchMesh.RIGHT_STATION_X, 0.408, 0),
      new THREE.Vector3(PhaseChangeBenchMesh.RIGHT_STATION_X + 0.032, 0.452, 0.006),
      new THREE.Vector3(0.055, 0.375, 0.005),
      new THREE.Vector3(0.135, 0.275, 0.003),
      new THREE.Vector3(port3X, collectorTopY + 0.022, 0),
    ]);
    const cable2Mesh = new THREE.Mesh(
      new THREE.TubeGeometry(cable2Curve, 48, 0.0026, 12, false),
      cableJacketMat
    );
    cable2Mesh.castShadow = true;
    this.standAndHeatingGroup.add(cable2Mesh);
  }

  /**
   * 7. 构建右侧「多通道温度采集器」（航天银白金属机身 + 宝石蓝倒角侧翼 + 顶部三通道航空插头 + 高清 T-t 曲线大屏 + 通道1/通道2 实体按键）
   */
  private buildMultiChannelCollector(): void {
    const cx = PhaseChangeBenchMesh.COLLECTOR_CENTER_X;
    this.collectorGroup.position.set(cx, 0, 0);

    const bodyW = 0.285;
    const bodyH = 0.188;
    const bodyD = 0.125;

    const silverBodyMat = anodizedAluminum(0xe2e8f0, 0.22);
    const frontPanelMat = anodizedAluminum(0xdbe2ea, 0.24);
    const blueAccentMat = new THREE.MeshPhysicalMaterial({
      color: 0x1d4ed8,
      metalness: 0.45,
      roughness: 0.28,
      clearcoat: 0.55,
    });
    const connectorMat = anodizedAluminum(0x1e293b, 0.3);
    const screenBezelMat = anodizedAluminum(0x1e293b, 0.25);

    // 底部防滑脚垫
    const footMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
    for (const fx of [-bodyW * 0.38, bodyW * 0.38]) {
      for (const fz of [-bodyD * 0.35, bodyD * 0.35]) {
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.014, 0.005, 16),
          footMat
        );
        foot.position.set(fx, 0.0025, fz);
        this.collectorGroup.add(foot);
      }
    }

    // 采集器主体银白机箱
    const mainChassis = new THREE.Mesh(
      createChamferedBoxGeometry(bodyW - 0.014, bodyH, bodyD, 0.014, 0.0028),
      silverBodyMat
    );
    mainChassis.position.set(0, 0.004, 0);
    mainChassis.castShadow = true;
    mainChassis.receiveShadow = true;
    this.collectorGroup.add(mainChassis);

    // 左右宝石蓝圆角护翼边框（还原参考图采集器两侧标志性的蓝边设计）
    for (const side of [-1, 1]) {
      const sideTrim = new THREE.Mesh(
        createChamferedBoxGeometry(0.012, bodyH + 0.002, bodyD + 0.003, 0.005, 0.0018),
        blueAccentMat
      );
      sideTrim.position.set(side * (bodyW * 0.5 - 0.004), 0.003, 0);
      this.collectorGroup.add(sideTrim);
    }

    // 顶部三路传感器航空插头底座与滚花锁母
    const portOffsetsX = [-0.048, -0.016, 0.045];
    portOffsetsX.forEach((px, idx) => {
      const socketBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0085, 0.0095, 0.012, 20),
        connectorMat
      );
      socketBase.position.set(px, bodyH + 0.008, 0);
      this.collectorGroup.add(socketBase);

      const plugBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0068, 0.0078, 0.022, 20),
        connectorMat
      );
      plugBody.position.set(px, bodyH + 0.020, 0);
      this.collectorGroup.add(plugBody);

      // 中间第 2 路插头同样延伸一条备用短引线汇入后方，还原参考图三接头细节
      if (idx === 1) {
        const auxCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(px, bodyH + 0.028, 0),
          new THREE.Vector3(px - 0.015, bodyH + 0.055, -0.012),
          new THREE.Vector3(-0.08, bodyH + 0.095, -0.018),
          new THREE.Vector3(
            PhaseChangeBenchMesh.RIGHT_STATION_X - cx + 0.008,
            0.38,
            -0.006
          ),
        ]);
        const auxCable = new THREE.Mesh(
          new THREE.TubeGeometry(auxCurve, 32, 0.0022, 10, false),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42 })
        );
        this.collectorGroup.add(auxCable);
      }
    });

    // 正面微凹浅灰银面板与顶部「多通道温度采集器」铭牌
    const frontFaceZ = bodyD * 0.5 + 0.001;
    const frontPlate = new THREE.Mesh(
      createFrontFacingRoundedBox(bodyW - 0.022, bodyH - 0.016, 0.003, 0.010, 0.001),
      frontPanelMat
    );
    frontPlate.position.set(0, 0.004 + bodyH * 0.5, frontFaceZ);
    this.collectorGroup.add(frontPlate);

    // 顶部「多通道温度采集器」字样铭牌贴图
    const headerTex = this.createCollectorHeaderTexture();
    const headerPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.018),
      new THREE.MeshBasicMaterial({ map: headerTex, transparent: true })
    );
    headerPlane.position.set(-0.018, 0.004 + bodyH - 0.019, frontFaceZ + 0.002);
    this.collectorGroup.add(headerPlane);

    // 液晶屏外框与深邃海洋蓝黑高清显示屏 (#08101e)
    const screenW = 0.192;
    const screenH = 0.128;
    const screenCenterX = -0.026;
    const screenCenterY = 0.004 + bodyH * 0.455;

    const screenBezel = new THREE.Mesh(
      createFrontFacingRoundedBox(screenW + 0.009, screenH + 0.009, 0.004, 0.006, 0.0012),
      screenBezelMat
    );
    screenBezel.position.set(screenCenterX, screenCenterY, frontFaceZ + 0.0015);
    this.collectorGroup.add(screenBezel);

    this.collectorCanvas = document.createElement('canvas');
    this.collectorCanvas.width = 960;
    this.collectorCanvas.height = 640;
    this.collectorTexture = new THREE.CanvasTexture(this.collectorCanvas);
    this.collectorTexture.colorSpace = THREE.SRGBColorSpace;
    this.collectorTexture.anisotropy = 8;

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(screenW, screenH),
      new THREE.MeshBasicMaterial({ map: this.collectorTexture })
    );
    screenMesh.position.set(screenCenterX, screenCenterY, frontFaceZ + 0.004);
    this.collectorGroup.add(screenMesh);

    // 右侧两枚立体倒角实体按键：「通道1 晶体」(蓝) 与 「通道2 非晶体」(红)
    const btnX = 0.102;
    const btnW = 0.038;
    const btnH = 0.038;
    const btnD = 0.009;

    // 1) 通道1 晶体 按键
    this.channel1ButtonGroup.position.set(btnX, screenCenterY + 0.034, frontFaceZ + 0.003);
    this.channel1ButtonGroup.userData.interactRole = 'toggle-channel-1';

    const btn1Bezel = new THREE.Mesh(
      createFrontFacingRoundedBox(btnW + 0.004, btnH + 0.004, 0.003, 0.006, 0.0008),
      screenBezelMat
    );
    this.channel1ButtonGroup.add(btn1Bezel);

    const btn1Tex = this.createChannelButtonTexture('通道1', '晶体', '#1d4ed8', '#3b82f6');
    this.channel1BtnMat = new THREE.MeshStandardMaterial({
      map: btn1Tex,
      roughness: 0.28,
      metalness: 0.18,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.18,
    });
    this.channel1BtnMesh = new THREE.Mesh(
      createFrontFacingRoundedBox(btnW, btnH, btnD, 0.005, 0.0014),
      this.channel1BtnMat
    );
    this.channel1BtnMesh.position.z = 0.0035;
    this.channel1BtnMesh.userData.interactRole = 'toggle-channel-1';
    this.channel1ButtonGroup.add(this.channel1BtnMesh);
    this.collectorGroup.add(this.channel1ButtonGroup);

    // 2) 通道2 非晶体 按键
    this.channel2ButtonGroup.position.set(btnX, screenCenterY - 0.034, frontFaceZ + 0.003);
    this.channel2ButtonGroup.userData.interactRole = 'toggle-channel-2';

    const btn2Bezel = new THREE.Mesh(
      createFrontFacingRoundedBox(btnW + 0.004, btnH + 0.004, 0.003, 0.006, 0.0008),
      screenBezelMat
    );
    this.channel2ButtonGroup.add(btn2Bezel);

    const btn2Tex = this.createChannelButtonTexture('通道2', '非晶体', '#b91c1c', '#ef4444');
    this.channel2BtnMat = new THREE.MeshStandardMaterial({
      map: btn2Tex,
      roughness: 0.28,
      metalness: 0.18,
      emissive: 0xb91c1c,
      emissiveIntensity: 0.18,
    });
    this.channel2BtnMesh = new THREE.Mesh(
      createFrontFacingRoundedBox(btnW, btnH, btnD, 0.005, 0.0014),
      this.channel2BtnMat
    );
    this.channel2BtnMesh.position.z = 0.0035;
    this.channel2BtnMesh.userData.interactRole = 'toggle-channel-2';
    this.channel2ButtonGroup.add(this.channel2BtnMesh);
    this.collectorGroup.add(this.channel2ButtonGroup);
  }

  /**
   * 每帧同步物理遥测并驱动：
   * 1. 左右酒精灯三层真实火焰摇曳与熄灭过渡；
   * 2. 左右水浴烧杯对流微气泡与液面微微波纹；
   * 3. 左管晶体（冰晶颗粒群随潜热吸收融化缩小下沉 + 透明熔液面上升）与右管非晶体（石蜡连续软化变清澈 + 内部微泡缓升）；
   * 4. 右侧多通道温度采集器高清 T-t 屏幕实时重绘与通道按键状态。
   */
  public update(delta: number, telemetry: PhaseChangeTelemetry): void {
    const dt = Math.max(0, Math.min(delta, 0.1));
    this.animClock += dt;

    // 1. 更新左右两盏酒精灯火焰动效
    this.updateAlcoholLampFlame(this.leftLampVisual, telemetry.leftLampLit, dt, 0.0);
    this.updateAlcoholLampFlame(this.rightLampVisual, telemetry.rightLampLit, dt, 2.1);

    // 2. 更新左右水浴烧杯对流气泡与水面微澜
    this.updateWaterBathDynamics(
      this.leftBathBubblesInstanced,
      this.leftBathBubbleStates,
      this.leftBathWaterTopDisc,
      telemetry.leftLampLit,
      telemetry.channel1BathTempC,
      dt
    );
    this.updateWaterBathDynamics(
      this.rightBathBubblesInstanced,
      this.rightBathBubbleStates,
      this.rightBathWaterTopDisc,
      telemetry.rightLampLit,
      telemetry.channel2BathTempC,
      dt
    );

    // 3. 更新左管：晶体（冰晶）三阶段固液相变表现
    this.updateCrystallineSample(telemetry.channel1MeltFraction);

    // 4. 更新右管：非晶体（石蜡）连续软化流化表现
    this.updateAmorphousSample(telemetry.channel2SoftenFraction, dt);

    // 5. 更新采集器按键按压状态与高清 T-t 图表画布
    this.updateCollectorButtons(telemetry.showChannel1, telemetry.showChannel2);
    this.renderCollectorScreen(telemetry);
  }

  private updateAlcoholLampFlame(
    lamp: AlcoholLampVisual,
    lit: boolean,
    dt: number,
    phaseOffset: number
  ): void {
    const targetIntensity = lit ? 1.0 : 0.0;
    const rate = lit ? 10.0 : 12.0;
    lamp.intensity += (targetIntensity - lamp.intensity) * Math.min(1, dt * rate);

    const k = lamp.intensity;
    if (k <= 0.005) {
      lamp.flameGroup.visible = false;
      lamp.flameLight.intensity = 0;
      lamp.gauzeGlowMat.opacity = 0;
      lamp.wickTipMat.emissiveIntensity = 0.05;
      return;
    }

    lamp.flameGroup.visible = true;
    const t = this.animClock * 11.5 + phaseOffset;
    const flickerY = 1.0 + Math.sin(t) * 0.05 + Math.cos(t * 2.3) * 0.03;
    const flickerXZ = 1.0 - Math.sin(t * 1.4) * 0.03;
    const swayX = Math.sin(t * 0.85) * 0.030;
    const swayZ = Math.cos(t * 0.72) * 0.020;

    lamp.flameGroup.scale.set(k * flickerXZ, k * flickerY, k * flickerXZ);
    lamp.flameGroup.rotation.set(swayZ, 0, swayX);

    lamp.flameOuterMat.opacity = 0.56 * k;
    lamp.flameMidMat.opacity = 0.84 * k;
    lamp.flameCoreMat.opacity = 0.95 * k;
    // 平滑自然的微风摇曳光强微调（约 5% 温和起伏），彻底杜绝 3.5Hz 频闪导致烧杯底面闪烁
    lamp.flameLight.intensity =
      (0.75 + Math.sin(this.animClock * 3.6 + phaseOffset) * 0.035 + Math.cos(this.animClock * 1.8) * 0.02) * k;
    lamp.gauzeGlowMat.opacity = 0.42 * k;
    lamp.wickTipMat.emissiveIntensity = 0.65 * k;
  }

  private updateWaterBathDynamics(
    instanced: THREE.InstancedMesh,
    states: BathBubbleState[],
    waterTopDisc: THREE.Mesh,
    lampLit: boolean,
    bathTempC: number,
    dt: number
  ): void {
    const heatFactor = lampLit
      ? Math.max(0.25, Math.min(1.0, (bathTempC - 18.0) / 65.0))
      : 0.06;

    waterTopDisc.position.y =
      0.0835 + Math.sin(this.animClock * 6.5) * 0.00045 * heatFactor;

    const minY = 0.008;
    const maxY = 0.082;
    const spanY = maxY - minY;

    for (let i = 0; i < states.length; i++) {
      const st = states[i];
      st.yFrac += dt * st.speed * (0.35 + heatFactor * 1.15);
      if (st.yFrac > 1.0) {
        st.yFrac -= 1.0;
      }

      const wobbleX = Math.sin(this.animClock * 4.5 + st.phase) * 0.0012;
      const wobbleZ = Math.cos(this.animClock * 3.8 + st.phase) * 0.0012;
      const bx = Math.cos(st.angle) * st.radius + wobbleX;
      const bz = Math.sin(st.angle) * st.radius + wobbleZ;
      const by = minY + st.yFrac * spanY;

      const visScale = lampLit ? st.size * (0.75 + 0.45 * st.yFrac) : st.size * 0.25;
      this.dummyPos.set(bx, by, bz);
      this.dummyQuat.identity();
      this.dummyScale.setScalar(visScale);
      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      instanced.setMatrixAt(i, this.dummyMatrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新左管晶体（冰晶）：
   * - meltFraction = 0: 全管堆积饱满冰晶多面体颗粒；
   * - 0 < meltFraction < 1 (固液共存潜热平台): 晶粒按 meltOrder 由外向内逐渐融化缩小并沉降，同时透明熔融液柱同步上升；
   * - meltFraction = 1 (液态升温段): 冰晶完全融化消失，全管呈清澈透明液态。
   */
  private updateCrystallineSample(meltFraction: number): void {
    const alpha = Math.max(0, Math.min(1, meltFraction));
    const maxSampleH = 0.064;

    // 1. 熔融液面高度随熔化分数 alpha 平滑上升
    const liquidH = Math.max(0.002, maxSampleH * (0.08 + 0.92 * alpha));
    this.crystalLiquidColumnMesh.scale.set(1, liquidH / maxSampleH, 1);
    this.crystalLiquidColumnMesh.position.y = 0.004 + liquidH * 0.5;
    this.crystalLiquidMat.opacity = 0.18 + 0.36 * alpha;

    this.crystalLiquidMeniscusMesh.position.y = 0.004 + liquidH;
    this.crystalLiquidMeniscusMesh.visible = alpha > 0.03;

    // 2. 各颗冰晶多面体颗粒随 alpha 渐进缩小与沉降（呈现真实固液共存态）
    for (let i = 0; i < this.crystalGranules.length; i++) {
      const g = this.crystalGranules[i];
      // 每颗晶粒在接近其 meltOrder 时加速消融
      const localRemain = Math.max(
        0,
        Math.min(1, (g.meltOrder + 0.22 - alpha * 1.18) / (g.meltOrder + 0.22))
      );
      const scaleFactor = Math.pow(localRemain, 0.65);

      // 融化过程中晶粒向试管下部固液混合物中轻微沉降聚拢
      const settleY = g.baseY * (1.0 - alpha * 0.42);
      const pullInward = 1.0 - alpha * 0.28;

      this.dummyPos.set(g.baseX * pullInward, Math.max(0.006, settleY), g.baseZ * pullInward);
      this.dummyEuler.set(g.rotX, g.rotY + alpha * 0.4, g.rotZ);
      this.dummyQuat.setFromEuler(this.dummyEuler);
      this.dummyScale.set(
        g.baseScaleX * scaleFactor,
        g.baseScaleY * scaleFactor,
        g.baseScaleZ * scaleFactor
      );
      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.crystalInstancedMesh.setMatrixAt(i, this.dummyMatrix);
    }
    this.crystalInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新右管非晶体（石蜡）：
   * 无固定熔点界面，随 softenFraction (0 -> 1) 连续由乳白硬质石蜡变为清澈微黄粘稠液体，内部微泡缓慢上浮
   */
  private updateAmorphousSample(softenFraction: number, dt: number): void {
    const s = Math.max(0, Math.min(1, softenFraction));

    // 石蜡材质粗糙度与不透明度随升温连续下降，透射率连续升高
    this.waxMaterial.roughness = 0.52 - s * 0.40;
    this.waxMaterial.opacity = 0.88 - s * 0.38;
    this.waxMaterial.transmission = 0.42 + s * 0.46;
    this.waxMaterial.color.setRGB(0.996, 0.976 - s * 0.02, 0.933 - s * 0.04);

    // 固态蜡块随软化逐渐坍缩融入流体主体
    const lumpRemain = Math.max(0, 1.0 - s * 0.92);
    for (let i = 0; i < this.waxLumps.length; i++) {
      const l = this.waxLumps[i];
      l.mesh.position.set(l.baseX * lumpRemain, l.baseY, l.baseZ * lumpRemain);
      l.mesh.scale.set(
        l.baseScaleX * lumpRemain,
        l.baseScaleY * (0.4 + 0.6 * lumpRemain),
        l.baseScaleZ * lumpRemain
      );
      l.mesh.visible = lumpRemain > 0.04;
    }

    // 石蜡内部包裹的微气泡：固态时静止，软化变稀后缓慢上浮
    const minY = 0.008;
    const maxY = 0.064;
    const spanY = maxY - minY;
    for (let i = 0; i < this.waxBubbleStates.length; i++) {
      const b = this.waxBubbleStates[i];
      b.yFrac += dt * b.speed * s * 0.85;
      if (b.yFrac > 1.0) b.yFrac -= 1.0;

      const bx = Math.cos(b.angle) * b.radius;
      const bz = Math.sin(b.angle) * b.radius;
      const by = minY + b.yFrac * spanY;

      this.dummyPos.set(bx, by, bz);
      this.dummyQuat.identity();
      this.dummyScale.setScalar(b.size * (1.0 - s * 0.15));
      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.waxBubblesInstanced.setMatrixAt(i, this.dummyMatrix);
    }
    this.waxBubblesInstanced.instanceMatrix.needsUpdate = true;
  }

  private updateCollectorButtons(showCh1: boolean, showCh2: boolean): void {
    // 激活态按键微亮凸起，关闭态按键微陷变暗
    this.channel1BtnMesh.position.z = showCh1 ? 0.0038 : 0.0016;
    this.channel1BtnMat.emissiveIntensity = showCh1 ? 0.24 : 0.03;
    this.channel1BtnMat.color.setHex(showCh1 ? 0xffffff : 0x94a3b8);

    this.channel2BtnMesh.position.z = showCh2 ? 0.0038 : 0.0016;
    this.channel2BtnMat.emissiveIntensity = showCh2 ? 0.24 : 0.03;
    this.channel2BtnMat.color.setHex(showCh2 ? 0xffffff : 0x94a3b8);
  }

  /**
   * 渲染多通道温度采集器屏幕（100% 极简还原参考图：坐标轴、网格线、右上角图例与红蓝双通道实时生长曲线）
   */
  private renderCollectorScreen(telemetry: PhaseChangeTelemetry): void {
    const key = `${telemetry.channel1TimeMin.toFixed(2)}_${telemetry.channel2TimeMin.toFixed(2)}_${telemetry.showChannel1 ? 1 : 0}_${telemetry.showChannel2 ? 1 : 0}`;
    if (key === this.lastScreenKey) return;
    this.lastScreenKey = key;

    const canvas = this.collectorCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.fillRect !== 'function') return;

    const W = canvas.width;
    const H = canvas.height;

    // 1. 深邃海洋蓝黑屏幕底色 (#08101e)
    if (typeof ctx.createLinearGradient === 'function') {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#091222');
      bgGrad.addColorStop(1, '#060c18');
      ctx.fillStyle = bgGrad;
    } else {
      ctx.fillStyle = '#08101e';
    }
    ctx.fillRect(0, 0, W, H);

    // 绘图坐标系边距（严格还原参考图比例）
    const plotLeft = 118;
    const plotRight = W - 64;
    const plotTop = 104;
    const plotBottom = H - 86;
    const plotW = plotRight - plotLeft;
    const plotH = plotBottom - plotTop;

    const timeToX = (tMin: number) =>
      plotLeft + (Math.max(0, Math.min(28, tMin)) / 28.0) * plotW;
    const tempToY = (tempC: number) =>
      plotBottom - (Math.max(0, Math.min(105, tempC)) / 105.0) * plotH;

    // 2. 暗色内部坐标网格线
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1.5;

    // 水平温度网格线 (20, 40, 60, 80, 100 °C)
    const tempTicks = [0, 20, 40, 60, 80, 100];
    for (const temp of tempTicks) {
      if (temp > 0) {
        const y = tempToY(temp);
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();
      }
    }

    // 垂直时间网格线 (5, 10, 15, 20, 25 min)
    const timeTicks = [0, 5, 10, 15, 20, 25];
    for (const tMin of timeTicks) {
      if (tMin > 0) {
        const x = timeToX(tMin);
        ctx.beginPath();
        ctx.moveTo(x, plotTop);
        ctx.lineTo(x, plotBottom);
        ctx.stroke();
      }
    }

    // 3. 白色坐标轴主轴线与箭头
    ctx.strokeStyle = '#e2e8f0';
    ctx.fillStyle = '#e2e8f0';
    ctx.lineWidth = 2.6;

    // Y 轴 (向上箭头)
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotBottom);
    ctx.lineTo(plotLeft, plotTop - 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop - 24);
    ctx.lineTo(plotLeft - 6, plotTop - 12);
    ctx.lineTo(plotLeft + 6, plotTop - 12);
    ctx.closePath();
    ctx.fill();

    // X 轴 (向右箭头)
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight + 14, plotBottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(plotRight + 22, plotBottom);
    ctx.lineTo(plotRight + 10, plotBottom - 6);
    ctx.lineTo(plotRight + 10, plotBottom + 6);
    ctx.closePath();
    ctx.fill();

    // 4. 坐标轴刻度线与数字标注
    ctx.font = '600 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const temp of tempTicks) {
      const y = tempToY(temp);
      if (temp > 0) {
        ctx.beginPath();
        ctx.moveTo(plotLeft - 6, y);
        ctx.lineTo(plotLeft, y);
        ctx.stroke();
      }
      ctx.fillText(String(temp), plotLeft - 14, y);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tMin of timeTicks) {
      const x = timeToX(tMin);
      if (tMin > 0) {
        ctx.beginPath();
        ctx.moveTo(x, plotBottom);
        ctx.lineTo(x, plotBottom + 6);
        ctx.stroke();
      }
      ctx.fillText(String(tMin), x, plotBottom + 12);
    }

    // 5. 坐标轴单位标题：「温度/°C」与「时间/min」
    ctx.font = '600 28px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('温度/°C', plotLeft - 52, plotTop - 28);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('时间/min', plotRight + 18, plotBottom + 44);

    // 6. 右上角图例（红线：晶体，蓝线：非晶体）
    const legendX = plotRight - 165;
    const legendY1 = plotTop - 42;
    const legendY2 = plotTop + 2;

    ctx.font = '600 27px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 图例 1：晶体 (红)
    ctx.globalAlpha = telemetry.showChannel1 ? 1.0 : 0.35;
    ctx.strokeStyle = '#ff2e2e';
    ctx.lineWidth = 5.0;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY1);
    ctx.lineTo(legendX + 44, legendY1);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('晶体', legendX + 56, legendY1);

    // 图例 2：非晶体 (蓝)
    ctx.globalAlpha = telemetry.showChannel2 ? 1.0 : 0.35;
    ctx.strokeStyle = '#1d9bf0';
    ctx.lineWidth = 5.0;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY2);
    ctx.lineTo(legendX + 44, legendY2);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('非晶体', legendX + 56, legendY2);
    ctx.globalAlpha = 1.0;

    // 7. 绘制通道 2（非晶体·蓝色平滑升温弧线）
    if (telemetry.showChannel2 && telemetry.channel2Curve.length > 1) {
      ctx.save?.();
      ctx.strokeStyle = '#1d9bf0';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      telemetry.channel2Curve.forEach((pt, idx) => {
        const px = timeToX(pt.timeMin);
        const py = tempToY(pt.tempC);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore?.();
    }

    // 8. 绘制通道 1（晶体·红色三阶段相变潜热曲线）
    if (telemetry.showChannel1 && telemetry.channel1Curve.length > 1) {
      ctx.save?.();
      ctx.strokeStyle = '#ff2a2a';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      telemetry.channel1Curve.forEach((pt, idx) => {
        const px = timeToX(pt.timeMin);
        const py = tempToY(pt.tempC);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore?.();
    }

    this.collectorTexture.needsUpdate = true;
  }

  /**
   * 生成石棉网/陶土网的精细金属编织丝网与中央洁白耐火陶瓷匀热纹理
   */
  private createWireGauzeTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.fillRect === 'function') {
      // 1. 底衬：浅亮纯净银灰金属底板
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, 512, 512);

      // 2. 细密编织不锈钢经纬金属丝网
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.6;
      const step = 16;
      for (let i = 0; i <= 512; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.0;
      for (let i = 0; i <= 512; i += step) {
        ctx.beginPath();
        ctx.moveTo(i + 1, 0);
        ctx.lineTo(i + 1, 512);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i + 1);
        ctx.lineTo(512, i + 1);
        ctx.stroke();
      }

      // 3. 中央高纯洁白高岭土耐火陶土匀热圆盘
      if (typeof ctx.createRadialGradient === 'function') {
        const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 182);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.85, 'rgba(248, 250, 252, 0.98)');
        grad.addColorStop(0.96, 'rgba(241, 245, 249, 0.85)');
        grad.addColorStop(1, 'rgba(226, 232, 240, 0.0)');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.beginPath();
      ctx.arc?.(256, 256, 182, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 生成烧杯外壁白底黑字高清标签纹理：「晶体 (冰晶)」与「非晶体 (石蜡)」
   */
  private createBeakerLabelTexture(title: string, subtitle: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.fillRect === 'function') {
      ctx.fillStyle = '#f8fafc';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(6, 6, 244, 148, 14);
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.fillRect(6, 6, 244, 148);
      }

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 44px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText?.(title, 128, 54);

      ctx.font = '600 38px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText?.(subtitle, 128, 110);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 生成采集器面板顶部「多通道温度采集器」丝印标题纹理
   */
  private createCollectorHeaderTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.fillRect === 'function') {
      ctx.clearRect?.(0, 0, 512, 72);
      ctx.fillStyle = '#1e293b';
      ctx.font = '700 40px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText?.('多通道温度采集器', 256, 36);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 生成采集器右侧「通道1 晶体」「通道2 非晶体」实体按键表面纹理
   */
  private createChannelButtonTexture(
    line1: string,
    line2: string,
    bgHex: string,
    borderHex: string
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.fillRect === 'function') {
      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, 256, 256);

      ctx.strokeStyle = borderHex;
      ctx.lineWidth = 10;
      ctx.strokeRect?.(10, 10, 236, 236);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 50px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText?.(line1, 128, 92);
      ctx.fillText?.(line2, 128, 166);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  public dispose(): void {
    this.collectorTexture?.dispose();
    disposeObjectTree(this.group);
  }
}

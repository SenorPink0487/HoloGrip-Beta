import * as THREE from 'three';
import {
  anodizedAluminum,
  labGlass,
  labMetal,
  paintTexture,
  polishedGold,
} from '../em/labKit.ts';
import { disposeObjectTree } from '../em/disposeObject.ts';
import {
  type FourierConductionTelemetry,
  type FourierRodMaterialId,
} from '../../physics/thermo/fourierConductionSolver.ts';

export interface FourierConductionBenchOptions {
  materialId?: FourierRodMaterialId;
  hotTempC?: number;
  coldTempC?: number;
}

/**
 * 创建带真实机械圆角与倒角的水平构件几何体
 * 严格保证几何体：X 居中 [-width/2, +width/2]，Z 居中 [-depth/2, +depth/2]，
 * 底部严格位于 Y = 0，顶部严格位于 Y = height（消除任何悬空错位）
 */
function createChamferedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.0018
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
 * 创建工业六角螺母/螺栓头几何体（中心在原点，轴向沿 Y）
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
 * 将温度 (0~150°C) 映射为热成像冷暖 RGB 色彩
 */
function temperatureToThermalColor(tempC: number, target: THREE.Color): THREE.Color {
  const t = Math.max(0, Math.min(1, (tempC - 18) / 105));
  if (t < 0.25) {
    const u = t / 0.25;
    target.setRGB(0.12 + u * 0.18, 0.56 + u * 0.28, 0.95 - u * 0.15);
  } else if (t < 0.55) {
    const u = (t - 0.25) / 0.30;
    target.setRGB(0.30 + u * 0.65, 0.84 - u * 0.06, 0.80 - u * 0.62);
  } else if (t < 0.80) {
    const u = (t - 0.55) / 0.25;
    target.setRGB(0.95 + u * 0.05, 0.78 - u * 0.40, 0.18 - u * 0.10);
  } else {
    const u = (t - 0.80) / 0.20;
    target.setRGB(1.0, 0.38 - u * 0.22, 0.08 + u * 0.04);
  }
  return target;
}

export class FourierConductionBenchMesh {
  public readonly group = new THREE.Group();

  // 七大精密装配件分组
  public readonly railBaseGroup = new THREE.Group();
  public readonly heaterControllerGroup = new THREE.Group();
  public readonly heatingFurnaceGroup = new THREE.Group();
  public readonly testRodAssemblyGroup = new THREE.Group();
  public readonly fiveChannelMonitorGroup = new THREE.Group();
  public readonly coolingChamberGroup = new THREE.Group();
  public readonly waterBathGroup = new THREE.Group();

  // 关键可交互组件引用
  public heaterPowerSwitchGroup!: THREE.Group;
  public heaterScreenMesh!: THREE.Mesh;
  public waterBathScreenMesh!: THREE.Mesh;
  public testRodSwappableGroup!: THREE.Group;
  public testRodOuterMesh!: THREE.Mesh;

  // 动态纹理画布
  private heaterDisplayCanvas!: HTMLCanvasElement;
  private heaterDisplayTex!: THREE.CanvasTexture;
  private lastHeaterDisplayKey = '';

  private monitorDisplayCanvas!: HTMLCanvasElement;
  private monitorDisplayTex!: THREE.CanvasTexture;
  private lastMonitorDisplayKey = '';

  private chillerDisplayCanvas!: HTMLCanvasElement;
  private chillerDisplayTex!: THREE.CanvasTexture;
  private lastChillerDisplayKey = '';

  private rodGradientCanvas!: HTMLCanvasElement;
  private rodGradientTex!: THREE.CanvasTexture;
  private rodEmissiveCanvas!: HTMLCanvasElement;
  private rodEmissiveTex!: THREE.CanvasTexture;
  private rodOuterMaterial!: THREE.MeshStandardMaterial;

  // 加热炉内部发热丝与红热透光材质
  private furnaceCoilMaterial!: THREE.MeshStandardMaterial;
  private furnaceCoreGlowMat!: THREE.MeshBasicMaterial;
  private switchRockerMesh!: THREE.Mesh;
  private switchRockerMat!: THREE.MeshStandardMaterial;

  // 导热棒内部声子/电子热流粒子系统
  private readonly heatParticleCount = 260;
  private heatParticlesPoints!: THREE.Points;
  private heatParticlePositions!: Float32Array;
  private heatParticleColors!: Float32Array;
  private heatParticlePhases!: Float32Array;
  private heatParticleRadialR!: Float32Array;
  private heatParticleRadialTheta!: Float32Array;

  // 右侧螺旋水冷盘管与蓝色硅胶水管内的流动微气泡粒子
  private readonly coolantBubbleCount = 120;
  private coolantBubblesPoints!: THREE.Points;
  private coolantBubblePositions!: Float32Array;
  private coolantBubbleColors!: Float32Array;
  private coolantBubbleProgress!: Float32Array;
  private coolantBubblePathIndex!: Uint8Array;
  private coolantCurves: THREE.Curve<THREE.Vector3>[] = [];

  // 关键几何基准常量 (m)
  public static readonly RAIL_BOTTOM_Y = 0.026;
  public static readonly RAIL_HEIGHT = 0.036;
  public static readonly RAIL_TOP_Y = 0.062; // 0.026 + 0.036
  public static readonly ROD_CENTER_Y = 0.148;
  public static readonly ROD_RADIUS = 0.013;
  public static readonly ROD_LEFT_X = -0.18;
  public static readonly ROD_RIGHT_X = 0.18;

  private tempColor = new THREE.Color();
  private baseMetalColor = new THREE.Color();
  private blendedColor = new THREE.Color();
  private clockTime = 0;

  constructor(_options: FourierConductionBenchOptions = {}) {
    this.group.name = 'FourierConductionBenchRoot';

    this.railBaseGroup.name = 'RailBaseAssembly';
    this.heaterControllerGroup.name = 'HeaterControllerBoxAssembly';
    this.heatingFurnaceGroup.name = 'HeatingFurnaceAssembly';
    this.testRodAssemblyGroup.name = 'TestRodAssembly';
    this.fiveChannelMonitorGroup.name = 'FiveChannelMonitorAssembly';
    this.coolingChamberGroup.name = 'CoolingChamberAssembly';
    this.waterBathGroup.name = 'CirculatingWaterBathAssembly';

    this.group.add(
      this.railBaseGroup,
      this.heaterControllerGroup,
      this.heatingFurnaceGroup,
      this.testRodAssemblyGroup,
      this.fiveChannelMonitorGroup,
      this.coolingChamberGroup,
      this.waterBathGroup
    );

    this.buildRailBaseAssembly();
    this.buildHeaterControllerBox();
    this.buildHeatingFurnaceAssembly();
    this.buildTestRodAndProbesAssembly();
    this.buildFiveChannelMonitorAssembly();
    this.buildCoolingChamberAssembly();
    this.buildCirculatingWaterBathAssembly();
    this.buildInterconnectingCablesAndHoses();
  }

  /**
   * 1. 精密工业挤压铝合金导轨底座与四角黄铜螺杆调平减震脚垫
   *    完全复刻参考图：宽幅拉丝银铝型材、正面双道工业 T 型凹槽、左右深灰端盖、四角黄铜调平地脚
   */
  private buildRailBaseAssembly(): void {
    const railWidth = 0.73;
    const railHeight = FourierConductionBenchMesh.RAIL_HEIGHT; // 0.036
    const railDepth = 0.116;
    const footHeight = FourierConductionBenchMesh.RAIL_BOTTOM_Y; // 0.026

    const silverAnodizedMat = anodizedAluminum(0xdce3ec, 0.22);
    const chromeMat = labMetal(0xf8fafc, 0.95, 0.14);
    const brassMat = polishedGold(0xd99b26);
    const darkEndCapMat = anodizedAluminum(0x27303f, 0.36);
    const slotRecessMat = anodizedAluminum(0x64748b, 0.35);

    // 主体挤压铝合金横梁 (底在 Y = 0.026，顶在 Y = 0.062)
    const mainBeamGeo = createChamferedBoxGeometry(
      railWidth,
      railHeight,
      railDepth,
      0.003,
      0.0012
    );
    const mainBeam = new THREE.Mesh(mainBeamGeo, silverAnodizedMat);
    mainBeam.position.set(0, footHeight, 0);
    mainBeam.castShadow = true;
    mainBeam.receiveShadow = true;
    this.railBaseGroup.add(mainBeam);

    // 顶面中央精密导槽亮条
    const topCenterStrip = new THREE.Mesh(
      createChamferedBoxGeometry(railWidth - 0.008, 0.0015, 0.032, 0.001, 0.0004),
      chromeMat
    );
    topCenterStrip.position.set(0, footHeight + railHeight - 0.0005, 0);
    this.railBaseGroup.add(topCenterStrip);

    // 正面 (+Z) 与背面 (-Z) 铝型材 T 型槽线条
    for (const zSign of [-1, 1]) {
      for (const slotOffsetY of [0.010, 0.025]) {
        const tSlot = new THREE.Mesh(
          new THREE.BoxGeometry(railWidth - 0.004, 0.0028, 0.002),
          slotRecessMat
        );
        tSlot.position.set(
          0,
          footHeight + slotOffsetY,
          zSign * (railDepth * 0.5 + 0.0003)
        );
        this.railBaseGroup.add(tSlot);
      }

      // 上下亮银突棱倒角条
      for (const ribY of [0.002, 0.016, 0.031]) {
        const rib = new THREE.Mesh(
          createChamferedBoxGeometry(railWidth - 0.002, 0.0035, 0.0025, 0.0008, 0.0004),
          chromeMat
        );
        rib.position.set(0, footHeight + ribY, zSign * (railDepth * 0.5 + 0.0004));
        this.railBaseGroup.add(rib);
      }
    }

    // 左右两端阶梯形深炭灰封头盖板 (完全齐平贴合导轨高度)
    for (const xSign of [-1, 1]) {
      const cap = new THREE.Mesh(
        createChamferedBoxGeometry(
          0.014,
          railHeight + 0.001,
          railDepth + 0.003,
          0.0025,
          0.001
        ),
        darkEndCapMat
      );
      cap.position.set(
        xSign * (railWidth * 0.5 + 0.006),
        footHeight - 0.0005,
        0
      );
      this.railBaseGroup.add(cap);
    }

    // 四个角的精密黄铜螺杆调平减震脚垫 (底在 Y = 0，顶在 Y = 0.026 严丝合缝接入导轨底部)
    const footX = railWidth * 0.5 - 0.018;
    const footZ = railDepth * 0.5 - 0.018;
    const footPadProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.018, 0.0),
      new THREE.Vector2(0.018, 0.006),
      new THREE.Vector2(0.015, 0.009),
      new THREE.Vector2(0.008, 0.010),
      new THREE.Vector2(0.0, 0.010),
    ];
    const footPadGeo = new THREE.LatheGeometry(footPadProfile, 28);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const footGroup = new THREE.Group();
        footGroup.position.set(sx * footX, 0, sz * footZ);

        // 底部防滑橡胶圆盘 (Y: 0 ~ 0.010)
        const padMesh = new THREE.Mesh(footPadGeo, darkEndCapMat);
        footGroup.add(padMesh);

        // 中部黄铜螺纹柱 (Y: 0.008 ~ 0.026)
        const brassStem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0052, 0.0052, 0.018, 20),
          brassMat
        );
        brassStem.position.y = 0.017;
        footGroup.add(brassStem);

        // 黄铜调平六角螺母 (Y = 0.014)
        const brassNut = new THREE.Mesh(
          createHexNutGeometry(0.0095, 0.005),
          brassMat
        );
        brassNut.position.y = 0.014;
        footGroup.add(brassNut);

        // 顶部不锈钢锁紧垫圈 (Y = 0.023)
        const topWasher = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.011, 0.004, 24),
          chromeMat
        );
        topWasher.position.y = 0.024;
        footGroup.add(topWasher);

        this.railBaseGroup.add(footGroup);
      }
    }
  }

  /**
   * 2. 左侧恒温加热 PID 控制器箱 (X = -0.485m)
   *    严格保证机身、顶盖、内嵌黑框数显屏与红色船型电源开关严丝合缝，绝无悬空
   */
  private buildHeaterControllerBox(): void {
    this.heaterControllerGroup.position.set(-0.485, 0, 0);

    const boxW = 0.134;
    const boxH = 0.162;
    const boxD = 0.126;
    const footH = 0.010;

    const cabinetMat = anodizedAluminum(0xe4e6eb, 0.28);
    const topLidMat = anodizedAluminum(0xd1d5db, 0.25);
    const darkBezelMat = anodizedAluminum(0x18202c, 0.28);

    // 4 枚底部减震脚垫 (Y: 0 ~ 0.010)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.010, footH, 20),
          darkBezelMat
        );
        foot.position.set(sx * (boxW * 0.35), footH * 0.5, sz * (boxD * 0.35));
        this.heaterControllerGroup.add(foot);
      }
    }

    // 控制器主箱体 (Y: 0.010 ~ 0.172)
    const bodyMesh = new THREE.Mesh(
      createChamferedBoxGeometry(boxW, boxH, boxD, 0.006, 0.002),
      cabinetMat
    );
    bodyMesh.position.y = footH;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.heaterControllerGroup.add(bodyMesh);

    // 顶部倒角折边上盖 (Y: 0.168 ~ 0.182，与主箱体顶部完全贴合)
    const topCover = new THREE.Mesh(
      createChamferedBoxGeometry(boxW + 0.002, 0.014, boxD + 0.002, 0.006, 0.002),
      topLidMat
    );
    topCover.position.y = footH + boxH - 0.004;
    this.heaterControllerGroup.add(topCover);

    // 正面 (+Z) PID 温控仪表内嵌黑框 (中心 Y = 0.116，完全位于箱体正面内部)
    const bezelW = 0.098;
    const bezelH = 0.088;
    const screenCenterY = footH + 0.106; // 0.116 (范围 0.072 ~ 0.160，处于箱顶 0.172 之下)
    const bezelFrame = new THREE.Mesh(
      createFrontFacingRoundedBox(bezelW, bezelH, 0.005, 0.004, 0.001),
      darkBezelMat
    );
    bezelFrame.position.set(0, screenCenterY, boxD * 0.5 + 0.0015);
    this.heaterControllerGroup.add(bezelFrame);

    // 动态 Canvas 数显屏幕 (PlaneGeometry 拥有标准 0..1 UV)
    this.heaterDisplayCanvas = document.createElement('canvas');
    this.heaterDisplayCanvas.width = 512;
    this.heaterDisplayCanvas.height = 460;
    this.heaterDisplayTex = new THREE.CanvasTexture(this.heaterDisplayCanvas);
    this.heaterDisplayTex.colorSpace = THREE.SRGBColorSpace;

    this.heaterScreenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(bezelW - 0.006, bezelH - 0.006),
      new THREE.MeshBasicMaterial({ map: this.heaterDisplayTex })
    );
    this.heaterScreenMesh.name = 'HeaterControllerScreen';
    this.heaterScreenMesh.userData = { interactRole: 'hot-temp-panel' };
    this.heaterScreenMesh.position.set(0, screenCenterY, boxD * 0.5 + 0.0045);
    this.heaterControllerGroup.add(this.heaterScreenMesh);

    // 仪表盘下方 4 枚微动按键碰撞体 (SET, ◀, ▼, ▲)
    const btnLabels = ['SET', '◀', '▼', '▲'];
    const btnRoles = ['hot-set', 'hot-step-down', 'hot-temp-down', 'hot-temp-up'];
    const btnCapMat = anodizedAluminum(0x475569, 0.30);
    for (let i = 0; i < 4; i++) {
      const bx = -0.0285 + i * 0.019;
      const by = screenCenterY - 0.028;
      const btnMesh = new THREE.Mesh(
        createFrontFacingRoundedBox(0.012, 0.0085, 0.003, 0.0015, 0.0005),
        btnCapMat
      );
      btnMesh.name = `HeaterBtn_${btnLabels[i]}`;
      btnMesh.userData = { interactRole: btnRoles[i] };
      btnMesh.position.set(bx, by, boxD * 0.5 + 0.005);
      this.heaterControllerGroup.add(btnMesh);
    }

    // 右下角红色背光船型电源开关 (I / O)
    this.heaterPowerSwitchGroup = new THREE.Group();
    this.heaterPowerSwitchGroup.name = 'HeaterPowerSwitch';
    this.heaterPowerSwitchGroup.userData = { interactRole: 'heater-power-toggle' };
    this.heaterPowerSwitchGroup.position.set(0.018, footH + 0.032, boxD * 0.5 + 0.0015);

    const switchHousing = new THREE.Mesh(
      createFrontFacingRoundedBox(0.023, 0.030, 0.005, 0.0025, 0.0008),
      darkBezelMat
    );
    switchHousing.userData = { interactRole: 'heater-power-toggle' };
    this.heaterPowerSwitchGroup.add(switchHousing);

    this.switchRockerMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: new THREE.Color(0xdc2626),
      emissiveIntensity: 0.55,
      roughness: 0.22,
      metalness: 0.12,
    });
    this.switchRockerMesh = new THREE.Mesh(
      createFrontFacingRoundedBox(0.015, 0.022, 0.006, 0.002, 0.0008),
      this.switchRockerMat
    );
    this.switchRockerMesh.position.z = 0.0028;
    this.switchRockerMesh.rotation.x = -0.18;
    this.switchRockerMesh.userData = { interactRole: 'heater-power-toggle' };
    this.heaterPowerSwitchGroup.add(this.switchRockerMesh);

    this.heaterControllerGroup.add(this.heaterPowerSwitchGroup);

    // 右侧壁 (+X = +0.067) 4 枚精密防水电缆接头 (上排 2 枚主加热输出、下排 2 枚热电偶测温输入)
    const chromeGlandMat = labMetal(0xf8fafc, 0.94, 0.15);
    const sidePortSpecs: Array<[number, number, THREE.Material]> = [
      [0.144, -0.008, anodizedAluminum(0xdc2626, 0.25)],
      [0.128, 0.008, darkBezelMat],
      [0.088, 0.008, anodizedAluminum(0xdc2626, 0.25)],
      [0.074, -0.008, darkBezelMat],
    ];
    for (const [py, pz, bootMat] of sidePortSpecs) {
      const hexNut = new THREE.Mesh(
        createHexNutGeometry(0.0062, 0.005),
        chromeGlandMat
      );
      hexNut.rotation.z = Math.PI / 2;
      hexNut.position.set(boxW * 0.5 + 0.0025, py, pz);
      this.heaterControllerGroup.add(hexNut);

      const reliefBoot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0038, 0.0050, 0.012, 16),
        bootMat
      );
      reliefBoot.rotation.z = -Math.PI / 2;
      reliefBoot.position.set(boxW * 0.5 + 0.009, py, pz);
      this.heaterControllerGroup.add(reliefBoot);
    }

    this.renderHeaterControllerScreen(100.0, 10.0, true);
  }

  /**
   * 3. 不锈钢多孔防烫护罩电加热炉 (X = -0.266m)
   *    修复黄底「高温表面」警示牌 UV、加密整圈散热圆孔阵列、完善双立柱鞍座及左侧接线端子
   */
  private buildHeatingFurnaceAssembly(): void {
    const furnaceCenterX = -0.266;
    const rodCenterY = FourierConductionBenchMesh.ROD_CENTER_Y; // 0.148
    const railTopY = FourierConductionBenchMesh.RAIL_TOP_Y; // 0.062
    const cageRadius = 0.051;

    this.heatingFurnaceGroup.position.set(furnaceCenterX, 0, 0);

    const chromeMat = labMetal(0xf8fafc, 0.96, 0.14);
    const satinAlumMat = anodizedAluminum(0xdce3ec, 0.22);
    const redBarrierMat = anodizedAluminum(0xdc2626, 0.22);
    const darkGlandMat = anodizedAluminum(0x1e293b, 0.32);

    // 左右两座 CNC 铝合金支撑鞍座 (底在 railTopY = 0.062，顶部弧形托架严丝合缝托住圆筒底部 Y = 0.097)
    const darkBoltMat = anodizedAluminum(0x1e293b, 0.28);
    for (const sx of [-0.045, 0.045]) {
      const pedGroup = new THREE.Group();
      pedGroup.position.set(sx, railTopY, 0);

      // 底部宽法兰板 (Y: 0 ~ 0.009)
      const flange = new THREE.Mesh(
        createChamferedBoxGeometry(0.038, 0.009, 0.072, 0.003, 0.001),
        satinAlumMat
      );
      pedGroup.add(flange);

      // 4 颗内六角圆柱头螺钉
      for (const bx of [-0.012, 0.012]) {
        for (const bz of [-0.025, 0.025]) {
          const bolt = new THREE.Mesh(createHexNutGeometry(0.0032, 0.0045), chromeMat);
          bolt.position.set(bx, 0.010, bz);
          pedGroup.add(bolt);
        }
      }

      // 中间立柱支腿 (Y: 0.009 ~ 0.036)
      const pillar = new THREE.Mesh(
        createChamferedBoxGeometry(0.024, 0.027, 0.040, 0.0025, 0.001),
        satinAlumMat
      );
      pillar.position.y = 0.009;
      pedGroup.add(pillar);

      // 上部托架鞍座 (Y: 0.032 ~ 0.048，完美衔接加热炉底面)
      const saddle = new THREE.Mesh(
        createChamferedBoxGeometry(0.030, 0.016, 0.056, 0.003, 0.001),
        satinAlumMat
      );
      saddle.position.y = 0.031;
      pedGroup.add(saddle);

      // 正面分体夹紧缝与双内六角锁紧螺钉
      const splitSlot = new THREE.Mesh(
        new THREE.BoxGeometry(0.0305, 0.0015, 0.002),
        darkBoltMat
      );
      splitSlot.position.set(0, 0.031, 0.028);
      pedGroup.add(splitSlot);

      for (const sbx of [-0.007, 0.007]) {
        const frontScrew = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0022, 0.0022, 0.003, 14),
          darkBoltMat
        );
        frontScrew.rotation.x = Math.PI / 2;
        frontScrew.position.set(sbx, 0.036, 0.0285);
        pedGroup.add(frontScrew);
      }

      this.heatingFurnaceGroup.add(pedGroup);
    }

    // 内部深炭灰陶瓷隔热内胆 (不透明深色内腔，使外层冲孔网呈现出高对比度深邃圆孔，同时透出红热炉丝)
    const innerChamberMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: new THREE.Color(0x7c2d12),
      emissiveIntensity: 0.25,
      roughness: 0.65,
      metalness: 0.25,
    });
    const innerChamber = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0445, 0.0445, 0.124, 36),
      innerChamberMat
    );
    innerChamber.rotation.z = Math.PI / 2;
    innerChamber.position.set(0, rodCenterY, 0);
    this.heatingFurnaceGroup.add(innerChamber);

    // 加热炉内部螺旋发热丝 (位于深色内胆与不锈钢冲孔网之间 R=0.0472，透过密集冲孔网可见红热螺旋炉丝)
    this.furnaceCoilMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      emissive: new THREE.Color(0xff3d00),
      emissiveIntensity: 1.5,
      roughness: 0.28,
      metalness: 0.35,
    });

    const coilPoints: THREE.Vector3[] = [];
    const coilTurns = 14;
    const coilLen = 0.106;
    const coilRadius = 0.0472;
    for (let i = 0; i <= 180; i++) {
      const t = i / 180;
      const angle = t * Math.PI * 2 * coilTurns;
      coilPoints.push(
        new THREE.Vector3(
          (t - 0.5) * coilLen,
          rodCenterY + Math.sin(angle) * coilRadius,
          Math.cos(angle) * coilRadius
        )
      );
    }
    const coilCurve = new THREE.CatmullRomCurve3(coilPoints);
    const coilGeo = new THREE.TubeGeometry(coilCurve, 160, 0.0024, 8, false);
    const coilMesh = new THREE.Mesh(coilGeo, this.furnaceCoilMaterial);
    coilMesh.name = 'InternalHeatingCoil';
    this.heatingFurnaceGroup.add(coilMesh);

    // 内部柔光热辐射层 (紧贴深色内胆表面，随加热功率呼吸明暗)
    this.furnaceCoreGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff3b00,
      transparent: true,
      opacity: 0.35,
    });
    const coreGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0452, 0.0452, 0.114, 32),
      this.furnaceCoreGlowMat
    );
    coreGlow.rotation.z = Math.PI / 2;
    coreGlow.position.set(0, rodCenterY, 0);
    this.heatingFurnaceGroup.add(coreGlow);

    // 外层不锈钢多孔防烫护罩 (全周向 36 行 × 13 列精密冲孔阵列，使用 alphaTest 镂空杜绝半透明排序瑕疵)
    const perfCanvas = document.createElement('canvas');
    perfCanvas.width = 1024;
    perfCanvas.height = 420;
    const pCtx = perfCanvas.getContext('2d');
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 1024;
    alphaCanvas.height = 420;
    const aCtx = alphaCanvas.getContext('2d');

    if (pCtx && aCtx) {
      // 304 不锈钢拉丝金属质感底色
      const metalGrad = pCtx.createLinearGradient(0, 0, 1024, 0);
      metalGrad.addColorStop(0, '#d1d8e2');
      metalGrad.addColorStop(0.25, '#f1f5f9');
      metalGrad.addColorStop(0.5, '#d8dee8');
      metalGrad.addColorStop(0.75, '#f8fafc');
      metalGrad.addColorStop(1, '#d1d8e2');
      pCtx.fillStyle = metalGrad;
      pCtx.fillRect(0, 0, 1024, 420);

      aCtx.fillStyle = '#ffffff';
      aCtx.fillRect(0, 0, 1024, 420);

      // CylinderGeometry: U 沿周向 (0~1024), V 沿轴向 (0~420)
      const circumRows = 36;
      const axialCols = 13;
      const axialMargin = 46;
      const axialSpan = 420 - axialMargin * 2;

      for (let uIdx = 0; uIdx < circumRows; uIdx++) {
        for (let vIdx = 0; vIdx < axialCols; vIdx++) {
          const cx = (uIdx + 0.5) * (1024 / circumRows);
          const cy = axialMargin + (vIdx + 0.5) * (axialSpan / axialCols);

          // 冲孔金属倒角暗圈
          pCtx.fillStyle = '#1e293b';
          pCtx.beginPath();
          if (typeof pCtx.arc === 'function') {
            pCtx.arc(cx, cy, 8.8, 0, Math.PI * 2);
          }
          pCtx.fill();

          // Alpha 穿孔透空
          aCtx.fillStyle = '#000000';
          aCtx.beginPath();
          if (typeof aCtx.arc === 'function') {
            aCtx.arc(cx, cy, 7.2, 0, Math.PI * 2);
          }
          aCtx.fill();
        }
      }
    }

    const perfColorTex = new THREE.CanvasTexture(perfCanvas);
    perfColorTex.colorSpace = THREE.SRGBColorSpace;
    const perfAlphaTex = new THREE.CanvasTexture(alphaCanvas);

    const cageMat = new THREE.MeshStandardMaterial({
      map: perfColorTex,
      alphaMap: perfAlphaTex,
      alphaTest: 0.45,
      transparent: false,
      side: THREE.FrontSide,
      roughness: 0.22,
      metalness: 0.88,
    });

    // 设置 thetaStart = Math.PI 使 UV 接缝隐藏在背面 (-Z)，正面 (+Z) 处于 U = 0.5 中心
    const outerCage = new THREE.Mesh(
      new THREE.CylinderGeometry(
        cageRadius,
        cageRadius,
        0.130,
        56,
        1,
        true,
        Math.PI,
        Math.PI * 2
      ),
      cageMat
    );
    outerCage.rotation.z = Math.PI / 2;
    outerCage.position.set(0, rodCenterY, 0);
    outerCage.castShadow = true;
    this.heatingFurnaceGroup.add(outerCage);

    // 左右两端精密车削不锈钢法兰端盖 (LatheGeometry)
    const flangeProfile = [
      new THREE.Vector2(0.012, 0.0),
      new THREE.Vector2(0.053, 0.0),
      new THREE.Vector2(0.053, 0.012),
      new THREE.Vector2(0.044, 0.014),
      new THREE.Vector2(0.044, 0.024),
      new THREE.Vector2(0.024, 0.026),
      new THREE.Vector2(0.012, 0.026),
    ];
    const flangeLatheGeo = new THREE.LatheGeometry(flangeProfile, 36);

    const leftCap = new THREE.Mesh(flangeLatheGeo, chromeMat);
    leftCap.rotation.z = Math.PI / 2;
    leftCap.position.set(-0.065, rodCenterY, 0);
    this.heatingFurnaceGroup.add(leftCap);

    const rightCap = new THREE.Mesh(flangeLatheGeo, chromeMat);
    rightCap.rotation.z = -Math.PI / 2;
    rightCap.position.set(0.065, rodCenterY, 0);
    this.heatingFurnaceGroup.add(rightCap);

    // 右侧标志性红色阳极氧化隔热环 (完全复刻参考图右侧红圈)
    const redRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0525, 0.0525, 0.008, 40),
      redBarrierMat
    );
    redRing.rotation.z = Math.PI / 2;
    redRing.position.set(0.056, rodCenterY, 0);
    this.heatingFurnaceGroup.add(redRing);

    // 右端导热棒抱紧卡盘套筒与法兰锁紧螺栓
    const chuckCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.024, 0.018, 32),
      chromeMat
    );
    chuckCollar.rotation.z = Math.PI / 2;
    chuckCollar.position.set(0.082, rodCenterY, 0);
    this.heatingFurnaceGroup.add(chuckCollar);

    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const rBolt = new THREE.Mesh(createHexNutGeometry(0.0028, 0.0045), chromeMat);
      rBolt.rotation.z = Math.PI / 2;
      rBolt.position.set(
        0.071,
        rodCenterY + Math.sin(ang) * 0.036,
        Math.cos(ang) * 0.036
      );
      this.heatingFurnaceGroup.add(rBolt);

      const lBolt = new THREE.Mesh(createHexNutGeometry(0.0028, 0.0045), chromeMat);
      lBolt.rotation.z = Math.PI / 2;
      lBolt.position.set(
        -0.071,
        rodCenterY + Math.sin(ang) * 0.036,
        Math.cos(ang) * 0.036
      );
      this.heatingFurnaceGroup.add(lBolt);
    }

    // 左端面双路水平电缆防水接头 (复刻参考图加热炉左侧面引出线护套)
    for (const [gy, gz] of [
      [rodCenterY - 0.002, 0.008],
      [rodCenterY - 0.012, -0.008],
    ]) {
      const sideGlandNut = new THREE.Mesh(
        createHexNutGeometry(0.0062, 0.005),
        chromeMat
      );
      sideGlandNut.rotation.z = Math.PI / 2;
      sideGlandNut.position.set(-0.092, gy, gz);
      this.heatingFurnaceGroup.add(sideGlandNut);

      const sideGland = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0046, 0.0056, 0.014, 18),
        darkGlandMat
      );
      sideGland.rotation.z = Math.PI / 2;
      sideGland.position.set(-0.099, gy, gz);
      this.heatingFurnaceGroup.add(sideGland);
    }

    // 正前方 (+Z) 「⚠️ 高温表面」黄底警示标牌
    // 使用 PlaneGeometry 以确保标准 [0, 1] UV 映射，彻底修复 ExtrudeGeometry UV 导致变黑的问题
    const warnTex = paintTexture(256, 256, (rawCtx, w, h) => {
      const ctx = rawCtx as any;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 8;
      if (typeof ctx.strokeRect === 'function') {
        ctx.strokeRect(8, 8, w - 16, h - 16);
      }

      // 黑色警告正三角
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 32);
      ctx.lineTo(w - 38, 168);
      ctx.lineTo(38, 168);
      if (typeof ctx.closePath === 'function') ctx.closePath();
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // 内部高温热浪符号
      ctx.lineWidth = 6;
      if (typeof ctx.quadraticCurveTo === 'function') {
        for (const dx of [-18, 0, 18]) {
          ctx.beginPath();
          ctx.moveTo(w * 0.5 + dx, 144);
          ctx.quadraticCurveTo(w * 0.5 + dx - 8, 126, w * 0.5 + dx, 112);
          ctx.quadraticCurveTo(w * 0.5 + dx + 8, 98, w * 0.5 + dx, 84);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - 32, 152);
      ctx.lineTo(w * 0.5 + 32, 152);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 34px "PingFang SC", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      if (typeof ctx.fillText === 'function') {
        ctx.fillText('高温表面', w * 0.5, 224);
      }
    });

    const warnBacking = new THREE.Mesh(
      createFrontFacingRoundedBox(0.038, 0.038, 0.002, 0.003, 0.0005),
      satinAlumMat
    );
    warnBacking.position.set(-0.006, rodCenterY, cageRadius + 0.0012);
    this.heatingFurnaceGroup.add(warnBacking);

    const warnPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.035, 0.035),
      new THREE.MeshBasicMaterial({ map: warnTex })
    );
    warnPlane.position.set(-0.006, rodCenterY, cageRadius + 0.0026);
    this.heatingFurnaceGroup.add(warnPlane);
  }

  /**
   * 4. 中间待测固体金属导热棒、3 座精密不锈钢立柱夹具与 5 路等间距热电偶探头 (T1~T5)
   *    完全复刻参考图：
   *    - T1 在左夹具左侧，T2 在左中之间，T3 正对中间顶柱上方，T4 在中右之间，T5 在右夹具右侧；
   *    - 探头底部螺母直接旋入导热棒顶部，立柱抱箍紧密包覆导热棒，零悬空缝隙！
   */
  private buildTestRodAndProbesAssembly(): void {
    const rodCenterY = FourierConductionBenchMesh.ROD_CENTER_Y; // 0.148
    const railTopY = FourierConductionBenchMesh.RAIL_TOP_Y; // 0.062
    const rodRadius = FourierConductionBenchMesh.ROD_RADIUS; // 0.013
    const rodSpanLen = 0.392; // 左端 (-0.190) 深入加热炉卡盘，右端 (+0.202) 深入水冷腔黄铜卡盘，零悬空缝隙
    const rodCenterX = 0.006;

    const chromeMat = labMetal(0xf8fafc, 0.96, 0.14);
    const satinSteelMat = anodizedAluminum(0xd1d8e2, 0.22);
    const darkBoltMat = anodizedAluminum(0x334155, 0.30);

    // 3 座不锈钢支撑立柱 (左 X=-0.104, 中 X=0.0, 右 X=+0.104，与 5 个探头交错排布完全一致)
    const pillarXs = [-0.104, 0.0, 0.104];
    pillarXs.forEach((px, idx) => {
      const supGroup = new THREE.Group();
      supGroup.position.set(px, railTopY, 0);

      if (idx !== 1) {
        // 左右两座：矩形法兰底座 + 阶梯方座 + 圆柱立柱 + 分体式圆环抱箍夹具 (完全包覆导热棒)
        const baseFlange = new THREE.Mesh(
          createChamferedBoxGeometry(0.036, 0.008, 0.054, 0.0025, 0.001),
          satinSteelMat
        );
        supGroup.add(baseFlange);

        for (const bx of [-0.012, 0.012]) {
          for (const bz of [-0.019, 0.019]) {
            const bolt = new THREE.Mesh(createHexNutGeometry(0.0028, 0.004), chromeMat);
            bolt.position.set(bx, 0.009, bz);
            supGroup.add(bolt);
          }
        }

        // 下部阶梯方台 (Y: 0.008 ~ 0.022)
        const lowerBlock = new THREE.Mesh(
          createChamferedBoxGeometry(0.024, 0.014, 0.030, 0.002, 0.0008),
          satinSteelMat
        );
        lowerBlock.position.y = 0.008;
        supGroup.add(lowerBlock);

        // 中部精密车削立柱轴 (Y: 0.022 ~ 0.058)
        const shaftH = rodCenterY - railTopY - 0.026 - 0.022; // 0.038
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0085, 0.0088, shaftH, 24),
          satinSteelMat
        );
        shaft.position.y = 0.022 + shaftH * 0.5;
        supGroup.add(shaft);

        // 上部圆形锁紧轴套 (Y: 0.058 ~ 0.070，复刻参考图抱箍下方圆柱套环与正面锁紧螺钉)
        const upperCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0142, 0.0142, 0.012, 28),
          satinSteelMat
        );
        upperCollar.position.y = rodCenterY - railTopY - 0.022;
        supGroup.add(upperCollar);

        const collarScrew = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0022, 0.0022, 0.003, 14),
          darkBoltMat
        );
        collarScrew.rotation.x = Math.PI / 2;
        collarScrew.position.set(0, rodCenterY - railTopY - 0.022, 0.014);
        supGroup.add(collarScrew);

        // 顶部圆环抱箍夹具下半耳块 (Y: 0.068 ~ 0.086)
        const clampEar = new THREE.Mesh(
          createChamferedBoxGeometry(0.020, 0.018, 0.028, 0.002, 0.0008),
          satinSteelMat
        );
        clampEar.position.y = rodCenterY - railTopY - 0.018;
        supGroup.add(clampEar);

        // 顶部圆环抱箍 (中心在 Y = rodCenterY - railTopY = 0.086，完整包住导热棒)
        const collarOuterR = rodRadius + 0.0062; // 0.0192
        const clampRing = new THREE.Mesh(
          new THREE.CylinderGeometry(collarOuterR, collarOuterR, 0.020, 32),
          satinSteelMat
        );
        clampRing.rotation.z = Math.PI / 2;
        clampRing.position.y = rodCenterY - railTopY;
        supGroup.add(clampRing);

        // 抱箍正面的内六角锁紧螺钉细节
        const clampBolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0024, 0.0024, 0.004, 16),
          darkBoltMat
        );
        clampBolt.rotation.x = Math.PI / 2;
        clampBolt.position.set(0, rodCenterY - railTopY - 0.011, 0.014);
        supGroup.add(clampBolt);
      } else {
        // 中间支撑立柱 (X = 0.0)：圆柱底座套筒 + 不锈钢立轴 + 顶部方形托块 (带正面双螺钉，紧托导热棒底面)
        const baseCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.0135, 0.018, 28),
          satinSteelMat
        );
        baseCollar.position.y = 0.009;
        supGroup.add(baseCollar);

        const topSaddleH = 0.013;
        const rodBottomLocalY = rodCenterY - railTopY - rodRadius; // 0.086 - 0.013 = 0.073
        const midShaftH = rodBottomLocalY - 0.018 - topSaddleH + 0.003; // 0.045
        const midShaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0080, 0.0082, midShaftH, 24),
          satinSteelMat
        );
        midShaft.position.y = 0.018 + midShaftH * 0.5;
        supGroup.add(midShaft);

        // 顶部方形托座 (顶面紧贴导热棒下母线 Y = rodBottomLocalY + 0.002)
        const saddle = new THREE.Mesh(
          createChamferedBoxGeometry(0.022, topSaddleH, 0.024, 0.002, 0.0008),
          satinSteelMat
        );
        saddle.position.y = rodBottomLocalY - topSaddleH + 0.002;
        supGroup.add(saddle);

        // 正面两颗内六角锁紧螺孔
        for (const sx of [-0.005, 0.005]) {
          const screw = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0018, 0.0018, 0.003, 12),
            darkBoltMat
          );
          screw.rotation.x = Math.PI / 2;
          screw.position.set(sx, rodBottomLocalY - topSaddleH * 0.5 + 0.002, 0.012);
          supGroup.add(screw);
        }
      }

      this.testRodAssemblyGroup.add(supGroup);
    });

    // 可切换金属材质的导热圆棒组件
    this.testRodSwappableGroup = new THREE.Group();
    this.testRodSwappableGroup.name = 'SwappableMetalRodGroup';
    this.testRodSwappableGroup.userData = { interactRole: 'cycle-rod-material' };
    this.testRodSwappableGroup.position.set(0, rodCenterY, 0);

    // 导热棒动态热成像与高饱和金属色泽复合贴图
    this.rodGradientCanvas = document.createElement('canvas');
    this.rodGradientCanvas.width = 512;
    this.rodGradientCanvas.height = 64;
    this.rodGradientTex = new THREE.CanvasTexture(this.rodGradientCanvas);
    this.rodGradientTex.colorSpace = THREE.SRGBColorSpace;

    this.rodEmissiveCanvas = document.createElement('canvas');
    this.rodEmissiveCanvas.width = 512;
    this.rodEmissiveCanvas.height = 64;
    this.rodEmissiveTex = new THREE.CanvasTexture(this.rodEmissiveCanvas);
    this.rodEmissiveTex.colorSpace = THREE.SRGBColorSpace;

    this.rodOuterMaterial = new THREE.MeshStandardMaterial({
      map: this.rodGradientTex,
      emissiveMap: this.rodEmissiveTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.32,
      roughness: 0.24,
      metalness: 0.86,
      transparent: true,
      opacity: 0.90,
    });

    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, rodSpanLen, 40, 24);
    rodGeo.rotateZ(-Math.PI / 2);
    const posAttr = rodGeo.attributes.position;
    const uvAttr = rodGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const u = Math.max(0, Math.min(1, (x + rodSpanLen * 0.5) / rodSpanLen));
      uvAttr.setXY(i, u, uvAttr.getY(i));
    }
    uvAttr.needsUpdate = true;

    this.testRodOuterMesh = new THREE.Mesh(rodGeo, this.rodOuterMaterial);
    this.testRodOuterMesh.name = 'TestRodMesh';
    this.testRodOuterMesh.position.x = rodCenterX;
    this.testRodOuterMesh.userData = { interactRole: 'cycle-rod-material' };
    this.testRodOuterMesh.castShadow = true;
    this.testRodSwappableGroup.add(this.testRodOuterMesh);

    // 导热棒内部声子/自由电子热流粒子系统
    this.buildInternalHeatFluxParticles(rodSpanLen, rodRadius * 0.72);

    this.testRodAssemblyGroup.add(this.testRodSwappableGroup);

    // 5 路等间距不锈钢热电偶测温探头 (T1 ~ T5)
    // 轴向位置：T1(-0.140), T2(-0.070), T3(0.0), T4(+0.070), T5(+0.140)
    // 采用分段式独立法线精密车削构件 + 缎面镍钢材质 + 深色退刀槽环，彻底消除背景同色反射导致的视觉断层
    const probeXs = [-0.140, -0.070, 0.0, 0.070, 0.140];
    const brassNutMat = polishedGold(0xd99b26);
    const probeNickelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.62,
      roughness: 0.26,
    });
    const probeGrooveMat = anodizedAluminum(0x1e293b, 0.30);

    probeXs.forEach((px, idx) => {
      const probeGroup = new THREE.Group();
      probeGroup.name = `ThermocoupleProbe_T${idx + 1}`;
      probeGroup.position.set(px, rodCenterY + rodRadius - 0.002, 0);

      // 1) 根部黄铜六角锁紧螺母 (Y: 0 ~ 0.0065，紧密旋入导热棒顶部)
      const hexNut = new THREE.Mesh(createHexNutGeometry(0.0065, 0.0065), brassNutMat);
      hexNut.position.y = 0.0032;
      probeGroup.add(hexNut);

      // 2) 下段滚花压紧套筒 (Y: 0.006 ~ 0.018)
      const lowerCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0052, 0.0054, 0.012, 24),
        probeNickelMat
      );
      lowerCollar.position.y = 0.012;
      probeGroup.add(lowerCollar);

      // 退刀槽黑环 1 (Y = 0.018)
      const groove1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.0016, 24),
        probeGrooveMat
      );
      groove1.position.y = 0.018;
      probeGroup.add(groove1);

      // 3) 中段主传感器套筒 (Y: 0.018 ~ 0.032)
      const midBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0050, 0.0052, 0.014, 24),
        probeNickelMat
      );
      midBarrel.position.y = 0.025;
      probeGroup.add(midBarrel);

      // 退刀槽黑环 2 (Y = 0.032)
      const groove2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0052, 0.0052, 0.0015, 24),
        probeGrooveMat
      );
      groove2.position.y = 0.032;
      probeGroup.add(groove2);

      // 4) 上段收口压线套管 (Y: 0.032 ~ 0.041)
      const upperSleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0038, 0.0046, 0.009, 24),
         brassNutMat
      );
      upperSleeve.position.y = 0.0365;
      probeGroup.add(upperSleeve);

      // 5) 顶部黑色防折应力护套 (Y: 0.040 ~ 0.048，与上方黑色引线无缝衔接)
      const boot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0024, 0.0035, 0.008, 16),
        darkBoltMat
      );
      boot.position.y = 0.044;
      probeGroup.add(boot);

      this.testRodAssemblyGroup.add(probeGroup);
    });
  }

  /**
   * 构建导热棒内部的声子/电子热流粒子系统
   */
  private buildInternalHeatFluxParticles(rodSpanLen: number, maxRadius: number): void {
    this.heatParticlePositions = new Float32Array(this.heatParticleCount * 3);
    this.heatParticleColors = new Float32Array(this.heatParticleCount * 3);
    this.heatParticlePhases = new Float32Array(this.heatParticleCount);
    this.heatParticleRadialR = new Float32Array(this.heatParticleCount);
    this.heatParticleRadialTheta = new Float32Array(this.heatParticleCount);

    for (let i = 0; i < this.heatParticleCount; i++) {
      const u = Math.random();
      this.heatParticlePhases[i] = u;
      const r = Math.sqrt(Math.random()) * maxRadius;
      const theta = Math.random() * Math.PI * 2;
      this.heatParticleRadialR[i] = r;
      this.heatParticleRadialTheta[i] = theta;

      this.heatParticlePositions[i * 3] = (u - 0.5) * rodSpanLen;
      this.heatParticlePositions[i * 3 + 1] = Math.sin(theta) * r;
      this.heatParticlePositions[i * 3 + 2] = Math.cos(theta) * r;

      this.heatParticleColors[i * 3] = 1.0;
      this.heatParticleColors[i * 3 + 1] = 0.6;
      this.heatParticleColors[i * 3 + 2] = 0.2;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.heatParticlePositions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(this.heatParticleColors, 3));

    const dotTex = paintTexture(64, 64, (rawCtx, w, h) => {
      const ctx = rawCtx as any;
      if (typeof ctx.createRadialGradient === 'function') {
        const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 2, w * 0.5, h * 0.5, w * 0.48);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.45, 'rgba(255, 240, 200, 0.85)');
        grad.addColorStop(1, 'rgba(255, 160, 60, 0)');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(0, 0, w, h);
    });

    const pMat = new THREE.PointsMaterial({
      size: 0.0082,
      map: dotTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.heatParticlesPoints = new THREE.Points(pGeo, pMat);
    this.heatParticlesPoints.name = 'HeatFluxParticles';
    this.testRodSwappableGroup.add(this.heatParticlesPoints);
  }

  /**
   * 5. 顶部五通道数显温度巡检仪 (FiveChannelMonitorAssembly)
   *    悬架于导热棒上方 (Y = 0.280m)，5 根黑色热电偶传感器引线从探头顶部护套平滑接入表头插孔
   */
  private buildFiveChannelMonitorAssembly(): void {
    const monitorY = 0.280;
    const monitorW = 0.306;
    const monitorH = 0.074;
    const monitorD = 0.046;

    this.fiveChannelMonitorGroup.position.set(0, monitorY, 0);

    const warmSilverMat = anodizedAluminum(0xe4e6eb, 0.26);
    const darkBezelMat = anodizedAluminum(0x1e293b, 0.30);
    const chromeMat = labMetal(0xf8fafc, 0.95, 0.14);

    // 外壳主体
    const casing = new THREE.Mesh(
      createFrontFacingRoundedBox(monitorW, monitorH, monitorD, 0.005, 0.0016),
      warmSilverMat
    );
    casing.castShadow = true;
    this.fiveChannelMonitorGroup.add(casing);

    // 内凹正面面板边框
    const innerRecess = new THREE.Mesh(
      createFrontFacingRoundedBox(monitorW - 0.010, monitorH - 0.010, 0.004, 0.0035, 0.001),
      anodizedAluminum(0xd1d5db, 0.28)
    );
    innerRecess.position.z = monitorD * 0.5 + 0.001;
    this.fiveChannelMonitorGroup.add(innerRecess);

    // 动态五通道 LED 数显屏 Canvas
    this.monitorDisplayCanvas = document.createElement('canvas');
    this.monitorDisplayCanvas.width = 1024;
    this.monitorDisplayCanvas.height = 240;
    this.monitorDisplayTex = new THREE.CanvasTexture(this.monitorDisplayCanvas);
    this.monitorDisplayTex.colorSpace = THREE.SRGBColorSpace;

    const monitorScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(monitorW - 0.016, monitorH - 0.016),
      new THREE.MeshBasicMaterial({ map: this.monitorDisplayTex })
    );
    monitorScreen.name = 'FiveChannelMonitorScreen';
    monitorScreen.position.z = monitorD * 0.5 + 0.0035;
    this.fiveChannelMonitorGroup.add(monitorScreen);

    // 底部 5 个探头航空插孔与 S 形柔性引线无缝连接下方探头顶部 (px = -0.140, -0.070, 0, +0.070, +0.140)
    const jackXs = [-0.112, -0.056, 0.0, 0.056, 0.112];
    const probeXs = [-0.140, -0.070, 0.0, 0.070, 0.140];
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.42,
      metalness: 0.2,
    });

    const probeTopWorldY =
      FourierConductionBenchMesh.ROD_CENTER_Y +
      FourierConductionBenchMesh.ROD_RADIUS -
      0.0025 +
      0.046; // ~0.2045
    const endLocalY = probeTopWorldY - monitorY; // -0.0755

    jackXs.forEach((jx, idx) => {
      const jackY = -monitorH * 0.28;
      const plug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0040, 0.0040, 0.006, 16),
        darkBezelMat
      );
      plug.rotation.x = Math.PI / 2;
      plug.position.set(jx, jackY, monitorD * 0.5 + 0.004);
      this.fiveChannelMonitorGroup.add(plug);

      const chromeRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0022, 0.0022, 0.007, 16),
        chromeMat
      );
      chromeRing.rotation.x = Math.PI / 2;
      chromeRing.position.set(jx, jackY, monitorD * 0.5 + 0.0045);
      this.fiveChannelMonitorGroup.add(chromeRing);

      // 传感器引线从面板插孔自然弯入下方探头护套
      const px = probeXs[idx];
      const startPt = new THREE.Vector3(jx, jackY - 0.002, monitorD * 0.5 + 0.004);
      const mid1 = new THREE.Vector3(
        jx + (px - jx) * 0.18,
         -monitorH * 0.5 - 0.012,
        0.014
      );
      const mid2 = new THREE.Vector3(
        jx + (px - jx) * 0.82,
        endLocalY + 0.022,
        0.004
      );
      const endPt = new THREE.Vector3(px, endLocalY, 0.0);
      const leadCurve = new THREE.CatmullRomCurve3([startPt, mid1, mid2, endPt]);
      const leadGeo = new THREE.TubeGeometry(leadCurve, 28, 0.0019, 8, false);
      const leadMesh = new THREE.Mesh(leadGeo, cableMat);
      this.fiveChannelMonitorGroup.add(leadMesh);
    });

    this.renderFiveChannelMonitor([98.2, 76.5, 58.7, 39.4, 25.1], true);
  }

  /**
   * 6. 右侧透明螺旋盘管水冷换热腔 (X = +0.245m)
   *    修复方形不锈钢压板与底座高度对齐、黄铜阶梯卡盘、四角拉杆螺母与双路快拧接头
   */
  private buildCoolingChamberAssembly(): void {
    const chamberX = 0.245;
    const rodCenterY = FourierConductionBenchMesh.ROD_CENTER_Y; // 0.148
    const railTopY = FourierConductionBenchMesh.RAIL_TOP_Y; // 0.062
    const plateH = 0.076;
    const plateD = 0.076;

    this.coolingChamberGroup.position.set(chamberX, 0, 0);

    const chromeMat = labMetal(0xf8fafc, 0.96, 0.14);
    const satinAlumMat = anodizedAluminum(0xdce3ec, 0.22);
    const brassMat = polishedGold(0xd99b26);
    const blueFittingMat = anodizedAluminum(0x2563eb, 0.26);

    // 底部 CNC 铝合金法兰板 (Y: 0.062 ~ 0.071)
    const baseFlange = new THREE.Mesh(
      createChamferedBoxGeometry(0.058, 0.009, 0.070, 0.003, 0.001),
      satinAlumMat
    );
    baseFlange.position.y = railTopY;
    this.coolingChamberGroup.add(baseFlange);

    for (const bx of [-0.020, 0.020]) {
      for (const bz of [-0.025, 0.025]) {
        const bolt = new THREE.Mesh(createHexNutGeometry(0.003, 0.0045), chromeMat);
        bolt.position.set(bx, railTopY + 0.010, bz);
        this.coolingChamberGroup.add(bolt);
      }
    }

    // 实心立柱支座 (Y: 0.071 ~ 0.112，严丝合缝托住水冷腔底面 rodCenterY - plateH/2 = 0.110)
    const chamberBottomY = rodCenterY - plateH * 0.5; // 0.110
    const pillarH = chamberBottomY - (railTopY + 0.009) + 0.003; // 0.042
    const pillar = new THREE.Mesh(
      createChamferedBoxGeometry(0.036, pillarH, 0.046, 0.003, 0.001),
      satinAlumMat
    );
    pillar.position.y = railTopY + 0.009;
    this.coolingChamberGroup.add(pillar);

    // 左侧连接导热棒的阶梯黄铜换热法兰套筒 (位于左压板 X=-0.042 外侧，严丝合缝抱紧导热棒右端，绝不侵入水冷腔内部)
    const brassChuckProfile = [
      new THREE.Vector2(0.011, 0.0),
      new THREE.Vector2(0.021, 0.0),
      new THREE.Vector2(0.021, 0.010),
      new THREE.Vector2(0.027, 0.011),
      new THREE.Vector2(0.027, 0.021),
      new THREE.Vector2(0.011, 0.021),
    ];
    const brassChuck = new THREE.Mesh(
      new THREE.LatheGeometry(brassChuckProfile, 32),
      brassMat
    );
    brassChuck.rotation.z = -Math.PI / 2;
    brassChuck.position.set(-0.063, rodCenterY, 0);
    this.coolingChamberGroup.add(brassChuck);

    // 腔体内侧左端薄型黄铜导热端面盘 (紧贴左压板内壁 X=-0.034，与螺旋盘管保持安全间隙)
    const innerBrassDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.004, 32),
      brassMat
    );
    innerBrassDisk.rotation.z = Math.PI / 2;
    innerBrassDisk.position.set(-0.032, rodCenterY, 0);
    this.coolingChamberGroup.add(innerBrassDisk);

    // 左右两端方形倒角不锈钢压板 (底在 chamberBottomY = 0.110，顶在 0.186，精确居中于 rodCenterY)
    const darkScrewMat = anodizedAluminum(0x1e293b, 0.28);
    for (const px of [-0.038, 0.038]) {
      const endPlate = new THREE.Mesh(
        createChamferedBoxGeometry(0.008, plateH, plateD, 0.004, 0.001),
        satinAlumMat
      );
      endPlate.position.set(px, chamberBottomY, 0);
      this.coolingChamberGroup.add(endPlate);

      // 压板顶部与底部突出的六角锁紧螺栓头 (复刻参考图水冷腔上下端面的螺栓头细节)
      for (const bz of [-0.022, 0.022]) {
        const topBolt = new THREE.Mesh(createHexNutGeometry(0.0036, 0.005), chromeMat);
        topBolt.position.set(px, chamberBottomY + plateH + 0.002, bz);
        this.coolingChamberGroup.add(topBolt);

        const botBolt = new THREE.Mesh(createHexNutGeometry(0.0036, 0.005), chromeMat);
        botBolt.position.set(px, chamberBottomY - 0.002, bz);
        this.coolingChamberGroup.add(botBolt);
      }
    }

    // 黄铜卡盘正面的内六角紧定螺钉细节 (位于外侧黄铜颈部 X=-0.057)
    const chuckScrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0022, 0.0022, 0.003, 14),
      darkScrewMat
    );
    chuckScrew.rotation.x = Math.PI / 2;
    chuckScrew.position.set(-0.057, rodCenterY, 0.021);
    this.coolingChamberGroup.add(chuckScrew);

    // 四角外部不锈钢拉杆与双六角锁紧螺母
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const ty = rodCenterY + sy * 0.029;
        const tz = sz * 0.029;
        const tieRod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0025, 0.0025, 0.096, 16),
          chromeMat
        );
        tieRod.rotation.z = Math.PI / 2;
        tieRod.position.set(0, ty, tz);
        this.coolingChamberGroup.add(tieRod);

        for (const nx of [-0.044, -0.032, 0.032, 0.044]) {
          const nut = new THREE.Mesh(createHexNutGeometry(0.0046, 0.004), chromeMat);
          nut.rotation.z = Math.PI / 2;
          nut.position.set(nx, ty, tz);
          this.coolingChamberGroup.add(nut);
        }
      }
    }

    // 内部深海蓝金属光泽螺旋冷却盘管 (轴向跨度严格约束在 [-0.025, +0.029] 内，与两侧端盖零穿模)
    const helixPoints: THREE.Vector3[] = [];
    const helixTurns = 5.5;
    const helixLen = 0.052;
    const helixR = 0.020;
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const ang = t * Math.PI * 2 * helixTurns;
      helixPoints.push(
        new THREE.Vector3(
          0.002 + (t - 0.5) * helixLen,
          rodCenterY + Math.sin(ang) * helixR,
          Math.cos(ang) * helixR
        )
      );
    }
    const helixCurve = new THREE.CatmullRomCurve3(helixPoints);
    const coilMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.28,
      roughness: 0.20,
      metalness: 0.78,
    });
    const spiralCoilMesh = new THREE.Mesh(
      new THREE.TubeGeometry(helixCurve, 100, 0.0040, 12, false),
      coilMat
    );
    spiralCoilMesh.name = 'SpiralCoolingCoil';
    this.coolingChamberGroup.add(spiralCoilMesh);

    const worldHelixPts = helixPoints.map(
      (p) => new THREE.Vector3(p.x + chamberX, p.y, p.z)
    );
    this.coolantCurves.push(new THREE.CatmullRomCurve3(worldHelixPts));

    // 内部圆柱形水套通道 + 外部高透倒角方形有机玻璃实体块 (复刻参考图厚壁透明亚克力腔体)
    const glassShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.066, 32),
      labGlass(0.18)
    );
    glassShell.rotation.z = Math.PI / 2;
    glassShell.position.set(0, rodCenterY, 0);
    this.coolingChamberGroup.add(glassShell);

    const acrylicBlock = new THREE.Mesh(
      createChamferedBoxGeometry(0.068, plateH - 0.003, plateD - 0.003, 0.004, 0.0012),
      labGlass(0.22)
    );
    acrylicBlock.position.set(0, chamberBottomY + 0.0015, 0);
    this.coolingChamberGroup.add(acrylicBlock);

    // 右侧上下两枚不锈钢转接螺母 + 蓝色快拧锁母
    for (const portY of [rodCenterY + 0.020, rodCenterY - 0.020]) {
      const hexAdaptor = new THREE.Mesh(
        createHexNutGeometry(0.0068, 0.010),
        chromeMat
      );
      hexAdaptor.rotation.z = Math.PI / 2;
      hexAdaptor.position.set(0.046, portY, 0);
      this.coolingChamberGroup.add(hexAdaptor);

      const blueNut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0066, 0.0066, 0.011, 20),
        blueFittingMat
      );
      blueNut.rotation.z = Math.PI / 2;
      blueNut.position.set(0.055, portY, 0);
      this.coolingChamberGroup.add(blueNut);
    }
  }

  /**
   * 7. 右侧恒温循环水浴箱 (CirculatingWaterBathAssembly, X = +0.505m)
   *    全三维立体精细构造：
   *    - 暖银白主箱体 (Y: 0.010 ~ 0.258) 与深灰蓝顶盖 (Y: 0.256 ~ 0.270) 100% 严丝合缝；
   *    - 正面上部独立嵌入式深色数显温控表头 (ctrlBezel)，绝不覆盖机身金属光泽；
   *    - 正面中部透明底丝印「恒温循环水浴」标识；
   *    - 正面下部 2 列 × 15 排真实 3D 冲压折边散热百叶窗片 + 深邃内腔阴影；
   *    - 左侧面透明底丝印「出水」「进水」标识 + 3 组不锈钢宝塔接头与蜗杆金属喉箍。
   */
  private buildCirculatingWaterBathAssembly(): void {
    const bathX = 0.505;
    const bathW = 0.178;
    const bathH = 0.248;
    const bathD = 0.156;
    const footH = 0.010;

    this.waterBathGroup.position.set(bathX, 0, 0);

    const cabinetMat = anodizedAluminum(0xe4e6eb, 0.28);
    const darkSlateMat = anodizedAluminum(0x27303f, 0.34);
    const darkCavityMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const chromeMat = labMetal(0xf8fafc, 0.95, 0.14);

    // 底部 4 个减震脚垫 (Y: 0 ~ 0.010)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.011, footH, 20),
          darkSlateMat
        );
        foot.position.set(sx * (bathW * 0.36), footH * 0.5, sz * (bathD * 0.36));
        this.waterBathGroup.add(foot);
      }
    }

    // 主箱体 (底在 Y = 0.010，顶在 Y = 0.258)
    const cabinet = new THREE.Mesh(
      createChamferedBoxGeometry(bathW, bathH, bathD, 0.006, 0.002),
      cabinetMat
    );
    cabinet.position.y = footH;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.waterBathGroup.add(cabinet);

    // 顶部深灰蓝倒角盖板 (底在 Y = 0.256，顶在 Y = 0.270，与主箱体顶部完全贴合)
    const lidH = 0.014;
    const topLidY = footH + bathH - 0.002; // 0.256
    const topLid = new THREE.Mesh(
      createChamferedBoxGeometry(bathW + 0.003, lidH, bathD + 0.003, 0.006, 0.002),
      darkSlateMat
    );
    topLid.position.y = topLidY;
    this.waterBathGroup.add(topLid);

    // 顶部提手把手 (直接安装在顶盖上表面 Y = 0.270)
    const handleTopY = topLidY + lidH; // 0.270
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.032, handleTopY - 0.002, 0),
      new THREE.Vector3(-0.032, handleTopY + 0.020, 0),
      new THREE.Vector3(0.032, handleTopY + 0.020, 0),
      new THREE.Vector3(0.032, handleTopY - 0.002, 0),
    ]);
    const handleMesh = new THREE.Mesh(
      new THREE.TubeGeometry(handleCurve, 28, 0.0048, 12, false),
      darkSlateMat
    );
    this.waterBathGroup.add(handleMesh);

    // 正面 (+Z) 上部嵌入式深色温控器外框 (中心 Y = 0.200)
    const ctrlW = 0.102;
    const ctrlH = 0.072;
    const ctrlCenterY = footH + 0.190; // 0.200
    const ctrlBezel = new THREE.Mesh(
      createFrontFacingRoundedBox(ctrlW, ctrlH, 0.005, 0.004, 0.001),
      darkSlateMat
    );
    ctrlBezel.position.set(0, ctrlCenterY, bathD * 0.5 + 0.0015);
    this.waterBathGroup.add(ctrlBezel);

    // 严格位于温控器黑框内部的动态数显屏幕 (绝不超出 ctrlBezel，保留机身真实 3D 光影)
    this.chillerDisplayCanvas = document.createElement('canvas');
    this.chillerDisplayCanvas.width = 480;
    this.chillerDisplayCanvas.height = 340;
    this.chillerDisplayTex = new THREE.CanvasTexture(this.chillerDisplayCanvas);
    this.chillerDisplayTex.colorSpace = THREE.SRGBColorSpace;

    this.waterBathScreenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ctrlW - 0.008, ctrlH - 0.008),
      new THREE.MeshBasicMaterial({ map: this.chillerDisplayTex })
    );
    this.waterBathScreenMesh.name = 'CirculatingWaterBathScreen';
    this.waterBathScreenMesh.userData = { interactRole: 'cold-temp-panel' };
    this.waterBathScreenMesh.position.set(0, ctrlCenterY, bathD * 0.5 + 0.0045);
    this.waterBathGroup.add(this.waterBathScreenMesh);

    // 温控器下方透明背景丝印：「恒温循环水浴」(Y = 0.148)
    const titleTex = paintTexture(512, 96, (rawCtx, w, h) => {
      const ctx = rawCtx as any;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 44px "PingFang SC", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (typeof ctx.fillText === 'function') {
        ctx.fillText('恒温循环水浴', w * 0.5, h * 0.5);
      }
    });
    const titleDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.116, 0.022),
      new THREE.MeshBasicMaterial({
        map: titleTex,
        transparent: true,
        depthWrite: false,
      })
    );
    titleDecal.position.set(0, footH + 0.138, bathD * 0.5 + 0.0012);
    this.waterBathGroup.add(titleDecal);

    // 正面下半部：真实 3D 双列 15 排冲压散热百叶窗格栅 (Y: 0.024 ~ 0.128)
    const colW = 0.062;
    const louverRows = 15;
    const louverBottomY = footH + 0.016; // 0.026
    const louverSpanH = 0.098;
    const slatGeo = createFrontFacingRoundedBox(colW, 0.0038, 0.0032, 0.0008, 0.0004);

    for (const colX of [-0.034, 0.034]) {
      // 百叶窗后方深邃吸光内腔底板
      const cavityPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(colW - 0.002, louverSpanH + 0.004),
        darkCavityMat
      );
      cavityPlane.position.set(
        colX,
        louverBottomY + louverSpanH * 0.5,
        bathD * 0.5 + 0.0006
      );
      this.waterBathGroup.add(cavityPlane);

      // 15 排微倾角立体金属百叶窗片
      for (let r = 0; r < louverRows; r++) {
        const ly = louverBottomY + (r + 0.5) * (louverSpanH / louverRows);
        const slat = new THREE.Mesh(slatGeo, cabinetMat);
        slat.position.set(colX, ly, bathD * 0.5 + 0.0018);
        slat.rotation.x = 0.22;
        this.waterBathGroup.add(slat);
      }
    }

    // 水浴控制器面板上的 4 枚微动按键碰撞体 (SET, ▲, ▼, ◀)
    const btnRoles = ['cold-set', 'cold-temp-up', 'cold-temp-down', 'cold-step'];
    for (let i = 0; i < 4; i++) {
      const bx = -0.027 + i * 0.018;
      const by = ctrlCenterY - 0.022;
      const btn = new THREE.Mesh(
        createFrontFacingRoundedBox(0.011, 0.008, 0.003, 0.0015, 0.0005),
        darkSlateMat
      );
      btn.name = `WaterBathBtn_${i}`;
      btn.userData = { interactRole: btnRoles[i] };
      btn.position.set(bx, by, bathD * 0.5 + 0.005);
      this.waterBathGroup.add(btn);
    }

    // 左侧壁 (-X) 2 组不锈钢宝塔出水/进水接头与蜗杆金属喉箍 (与水冷腔上下双口一一对正，彻底杜绝下方导轨穿模)
    const portYs = [0.168, 0.120];
    for (const py of portYs) {
      const hexBase = new THREE.Mesh(
        createHexNutGeometry(0.0085, 0.006),
        chromeMat
      );
      hexBase.rotation.z = Math.PI / 2;
      hexBase.position.set(-bathW * 0.5 - 0.003, py, 0);
      this.waterBathGroup.add(hexBase);

      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0062, 0.0072, 0.018, 20),
        chromeMat
      );
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(-bathW * 0.5 - 0.011, py, 0);
      this.waterBathGroup.add(nozzle);

      // 金属蜗杆喉箍环 + 顶部蜗杆锁紧螺丝座
      const clampCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0082, 0.0082, 0.006, 20),
        chromeMat
      );
      clampCollar.rotation.z = Math.PI / 2;
      clampCollar.position.set(-bathW * 0.5 - 0.015, py, 0);
      this.waterBathGroup.add(clampCollar);

      const wormScrew = new THREE.Mesh(
        createChamferedBoxGeometry(0.006, 0.005, 0.006, 0.001, 0.0004),
        chromeMat
      );
      wormScrew.position.set(-bathW * 0.5 - 0.015, py + 0.0075, 0.002);
      this.waterBathGroup.add(wormScrew);
    }

    // 左侧壁透明背景丝印「出水」「进水」标签 (正对上口与下口上方，无矩形色差底块)
    const sideLabelTex = paintTexture(128, 256, (rawCtx, w, h) => {
      const ctx = rawCtx as any;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 34px "PingFang SC", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      if (typeof ctx.fillText === 'function') {
        ctx.fillText('出水', w * 0.5, 58);
        ctx.fillText('进水', w * 0.5, 192);
      }
    });
    const sideLabelPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.038, 0.096),
      new THREE.MeshBasicMaterial({
        map: sideLabelTex,
        transparent: true,
        depthWrite: false,
      })
    );
    sideLabelPlane.rotation.y = -Math.PI / 2;
    sideLabelPlane.position.set(-bathW * 0.5 - 0.001, 0.162, 0.0);
    this.waterBathGroup.add(sideLabelPlane);

    this.renderWaterBathFrontPanel(20.0, 20.0);
  }

  /**
   * 8. 构建左侧红黑加热供电线缆、右侧双路蓝色硅胶冷却水管与管内循环流动微气泡
   */
  private buildInterconnectingCablesAndHoses(): void {
    const rodCenterY = FourierConductionBenchMesh.ROD_CENTER_Y; // 0.148
    const brassMat = polishedGold(0xd99b26);
    const chromeMat = labMetal(0xf8fafc, 0.94, 0.15);
    const redGlandMat = anodizedAluminum(0xdc2626, 0.25);

    const redCableMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.32,
      metalness: 0.12,
    });
    const darkCableMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.36,
      metalness: 0.18,
    });

    // 1) 顶部拱形红黑主供电电缆：从控制器右侧壁上排防水接头水平引出，平滑拱起接入加热炉顶部接头（彻底避开控制器顶盖边缘，零穿模）
    const upperRedArch = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.412, 0.144, -0.008),
      new THREE.Vector3(-0.386, 0.148, -0.008),
      new THREE.Vector3(-0.364, 0.205, -0.007),
      new THREE.Vector3(-0.332, 0.236, -0.005),
      new THREE.Vector3(-0.303, 0.222, -0.004),
      new THREE.Vector3(-0.300, rodCenterY + 0.052, -0.004),
    ]);
    const upperBlackArch = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.412, 0.128, 0.008),
      new THREE.Vector3(-0.388, 0.132, 0.008),
      new THREE.Vector3(-0.368, 0.190, 0.008),
      new THREE.Vector3(-0.342, 0.224, 0.007),
      new THREE.Vector3(-0.318, 0.216, 0.006),
      new THREE.Vector3(-0.316, rodCenterY + 0.052, 0.006),
    ]);

    // 2) 下部红黑测温反馈线缆：从加热炉左端面双防水护套水平引出，呈平滑 S 弧线接入控制器右侧壁下排接头（绝不误插导轨端盖）
    const lowerRedLoop = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.362, rodCenterY - 0.002, 0.008),
      new THREE.Vector3(-0.378, rodCenterY - 0.004, 0.008),
      new THREE.Vector3(-0.394, 0.094, 0.008),
      new THREE.Vector3(-0.412, 0.088, 0.008),
    ]);
    const lowerBlackLoop = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.362, rodCenterY - 0.012, -0.008),
      new THREE.Vector3(-0.376, rodCenterY - 0.015, -0.008),
      new THREE.Vector3(-0.392, 0.080, -0.008),
      new THREE.Vector3(-0.412, 0.074, -0.008),
    ]);

    this.group.add(
      new THREE.Mesh(new THREE.TubeGeometry(upperRedArch, 40, 0.0035, 10, false), redCableMat),
      new THREE.Mesh(new THREE.TubeGeometry(upperBlackArch, 40, 0.0035, 10, false), darkCableMat),
      new THREE.Mesh(new THREE.TubeGeometry(lowerRedLoop, 28, 0.0029, 10, false), redCableMat),
      new THREE.Mesh(new THREE.TubeGeometry(lowerBlackLoop, 28, 0.0029, 10, false), darkCableMat)
    );

    // 加热炉顶部两枚黄铜/红色防折护套接头与六角锁紧底座
    for (const [gx, gz, gMat] of [
      [-0.300, -0.004, redGlandMat],
      [-0.316, 0.006, brassMat],
    ] as Array<[number, number, THREE.Material]>) {
      const topGlandNut = new THREE.Mesh(
        createHexNutGeometry(0.0065, 0.005),
        chromeMat
      );
      topGlandNut.position.set(gx, rodCenterY + 0.049, gz);
      const topGlandSleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0046, 0.0056, 0.015, 16),
        gMat
      );
      topGlandSleeve.position.set(gx, rodCenterY + 0.056, gz);
      this.group.add(topGlandNut, topGlandSleeve);
    }

    // 右侧双路半透明蓝色硅胶循环冷却水管 (1对1精确对接水冷腔右侧上下快拧头 X=0.302 与水浴箱左侧上下宝塔头 X=0.404，全程悬空于导轨上方零穿模)
    const upperHoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.302, rodCenterY + 0.020, 0),
      new THREE.Vector3(0.336, rodCenterY + 0.020, 0.003),
      new THREE.Vector3(0.370, 0.168, 0.002),
      new THREE.Vector3(0.404, 0.168, 0),
    ]);
    const lowerHoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.404, 0.120, 0),
      new THREE.Vector3(0.370, 0.120, -0.003),
      new THREE.Vector3(0.336, rodCenterY - 0.020, -0.002),
      new THREE.Vector3(0.302, rodCenterY - 0.020, 0),
    ]);

    this.coolantCurves.push(upperHoseCurve, lowerHoseCurve);

    const blueSiliconeHoseMat = new THREE.MeshPhysicalMaterial({
      color: 0x2563eb,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.16,
      roughness: 0.22,
      metalness: 0.05,
      transmission: 0.48,
      transparent: true,
      opacity: 0.84,
    });

    const upperHose = new THREE.Mesh(
      new THREE.TubeGeometry(upperHoseCurve, 36, 0.0052, 14, false),
      blueSiliconeHoseMat
    );
    upperHose.name = 'UpperBlueCoolingHose';
    const lowerHose = new THREE.Mesh(
      new THREE.TubeGeometry(lowerHoseCurve, 36, 0.0052, 14, false),
      blueSiliconeHoseMat
    );
    lowerHose.name = 'LowerBlueCoolingHose';
    this.group.add(upperHose, lowerHose);

    // 构建螺旋盘管与双路蓝管内的动态循环水气泡粒子
    this.coolantBubblePositions = new Float32Array(this.coolantBubbleCount * 3);
    this.coolantBubbleColors = new Float32Array(this.coolantBubbleCount * 3);
    this.coolantBubbleProgress = new Float32Array(this.coolantBubbleCount);
    this.coolantBubblePathIndex = new Uint8Array(this.coolantBubbleCount);

    for (let i = 0; i < this.coolantBubbleCount; i++) {
      this.coolantBubbleProgress[i] = Math.random();
      const pathIdx = i < 60 ? 0 : i < 90 ? 1 : 2;
      this.coolantBubblePathIndex[i] = pathIdx;

      const pt = this.coolantCurves[pathIdx].getPoint(this.coolantBubbleProgress[i]);
      this.coolantBubblePositions[i * 3] = pt.x;
      this.coolantBubblePositions[i * 3 + 1] = pt.y;
      this.coolantBubblePositions[i * 3 + 2] = pt.z;

      this.coolantBubbleColors[i * 3] = 0.45;
      this.coolantBubbleColors[i * 3 + 1] = 0.88;
      this.coolantBubbleColors[i * 3 + 2] = 1.0;
    }

    const bubbleGeo = new THREE.BufferGeometry();
    bubbleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.coolantBubblePositions, 3)
    );
    bubbleGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(this.coolantBubbleColors, 3)
    );

    const bubbleDotTex = paintTexture(64, 64, (rawCtx, w, h) => {
      const ctx = rawCtx as any;
      if (typeof ctx.createRadialGradient === 'function') {
        const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 2, w * 0.5, h * 0.5, w * 0.48);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.5, 'rgba(125, 211, 252, 0.85)');
        grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = '#38bdf8';
      }
      ctx.fillRect(0, 0, w, h);
    });

    const bubbleMat = new THREE.PointsMaterial({
      size: 0.0072,
      map: bubbleDotTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.coolantBubblesPoints = new THREE.Points(bubbleGeo, bubbleMat);
    this.coolantBubblesPoints.name = 'CoolingWaterBubbles';
    this.group.add(this.coolantBubblesPoints);
  }

  /**
   * 绘制左侧 PID 恒温加热控制器数显面板
   */
  private renderHeaterControllerScreen(
    hotTempC: number,
    powerW: number,
    heaterOn: boolean
  ): void {
    const key = `${hotTempC.toFixed(1)}_${powerW.toFixed(2)}_${heaterOn ? 1 : 0}`;
    if (key === this.lastHeaterDisplayKey) return;
    this.lastHeaterDisplayKey = key;

    const ctx = this.heaterDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.heaterDisplayCanvas.width;
    const h = this.heaterDisplayCanvas.height;

    ctx.fillStyle = '#08101e';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 22px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PID TEMP CONTROLLER', 28, 46);

    // 状态指示灯
    ctx.fillStyle = heaterOn ? '#ef4444' : '#475569';
    ctx.beginPath();
    if (typeof ctx.arc === 'function') {
      ctx.arc(w - 42, 38, 10, 0, Math.PI * 2);
    }
    ctx.fill();

    // 第一排：红色数码管温度读数 (100.0)
    ctx.fillStyle = heaterOn ? '#ff2a2a' : '#64748b';
    ctx.font = 'bold 92px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(heaterOn ? hotTempC.toFixed(1) : 'OFF', w - 76, 158);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('°C', w - 64, 150);

    // 第二排：绿色数码管功率读数 (10.00)
    ctx.fillStyle = heaterOn ? '#22c55e' : '#475569';
    ctx.font = 'bold 68px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(powerW.toFixed(2), w - 76, 254);

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('W', w - 64, 248);

    // 底部 4 枚按键丝印标识 (SET, ◀, ▼, ▲)
    const labels = ['SET', '◀', '▼', '▲'];
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      const bx = 92 + i * 108;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bx - 36, 330, 72, 54);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 36, 330, 72, 54);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(labels[i], bx, 366);
    }

    this.heaterDisplayTex.needsUpdate = true;
  }

  /**
   * 绘制顶部五通道数显巡检仪屏幕 (T1 ~ T5 红色数码管读数)
   */
  private renderFiveChannelMonitor(
    temps: [number, number, number, number, number],
    heaterOn: boolean
  ): void {
    const key = `${temps.map((t) => t.toFixed(1)).join('_')}_${heaterOn ? 1 : 0}`;
    if (key === this.lastMonitorDisplayKey) return;
    this.lastMonitorDisplayKey = key;

    const ctx = this.monitorDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.monitorDisplayCanvas.width;
    const h = this.monitorDisplayCanvas.height;

    ctx.fillStyle = '#dce3ec';
    ctx.fillRect(0, 0, w, h);

    const slotW = 172;
    const slotH = 104;
    const startX = 36;
    const gap = 22;

    for (let i = 0; i < 5; i++) {
      const sx = startX + i * (slotW + gap);
      const sy = 24;

      ctx.fillStyle = '#08101e';
      ctx.fillRect(sx, sy, slotW, slotH);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.strokeRect(sx, sy, slotW, slotH);

      ctx.fillStyle = '#ff2424';
      ctx.font = 'bold 58px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(temps[i].toFixed(1), sx + slotW - 14, sy + 72);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`T${i + 1}`, sx + slotW * 0.5, sy + slotH + 36);

      ctx.fillStyle = '#475569';
      ctx.font = '600 18px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('°C', sx + slotW - 4, sy + slotH + 34);
    }

    this.monitorDisplayTex.needsUpdate = true;
  }

  /**
   * 绘制右侧恒温循环水浴嵌入式温控表头屏幕 (蓝/绿双排数显 + 按键标识)
   */
  private renderWaterBathFrontPanel(coldTempC: number, outletTempC: number): void {
    const key = `${coldTempC.toFixed(1)}_${outletTempC.toFixed(1)}`;
    if (key === this.lastChillerDisplayKey) return;
    this.lastChillerDisplayKey = key;

    const ctx = this.chillerDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.chillerDisplayCanvas.width;
    const h = this.chillerDisplayCanvas.height;

    // 深海蓝黑控制器面板底色
    ctx.fillStyle = '#08101e';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // 内层液晶显示窗框
    ctx.fillStyle = '#050b14';
    ctx.fillRect(28, 24, w - 56, 204);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 24, w - 56, 204);

    // 蓝色 PV 实际水温读数
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 82px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(outletTempC.toFixed(1), w - 96, 108);
    ctx.font = 'bold 26px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('°C', w - 82, 98);

    // 绿色 SV 设定水温读数
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 74px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(coldTempC.toFixed(1), w - 96, 196);
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SV', w - 82, 188);

    // 底部 4 枚按键丝印标识 (SET, ▲, ▼, ◀)
    const btnLabels = ['SET', '▲', '▼', '◀'];
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      const bx = 90 + i * 100;
      ctx.fillStyle = i === 0 ? '#0284c7' : '#1e293b';
      ctx.fillRect(bx - 34, 252, 68, 52);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 34, 252, 68, 52);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(btnLabels[i], bx, 286);
    }

    this.chillerDisplayTex.needsUpdate = true;
  }

  /**
   * 实时更新导热棒表面金属色泽与热成像渐变
   */
  private updateRodThermalSurface(telem: FourierConductionTelemetry): void {
    const matSpec = telem.material;
    this.baseMetalColor.setHex(matSpec.colorHex);

    const ctx = this.rodGradientCanvas.getContext('2d');
    const eCtx = this.rodEmissiveCanvas.getContext('2d');
    if (ctx && eCtx) {
      const w = this.rodGradientCanvas.width;
      const h = this.rodGradientCanvas.height;
      const samples = telem.profileSamples;
      const n = samples.length;

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const eGrad = eCtx.createLinearGradient(0, 0, w, 0);

      for (let i = 0; i < n; i += 2) {
        const stop = i / (n - 1);
        const tempC = samples[i].tempC;
        temperatureToThermalColor(tempC, this.tempColor);

        // 保留 72% 真实金属本色（如醇厚黄铜/紫铜光泽）+ 28% 热成像色彩，使金属质感真实不发灰
        this.blendedColor.copy(this.baseMetalColor).lerp(this.tempColor, 0.28);
        grad.addColorStop(stop, `#${this.blendedColor.getHexString()}`);

        const heatRatio = Math.max(0, Math.min(1, (tempC - 28) / 110));
        this.tempColor.multiplyScalar(heatRatio * 0.65);
        eGrad.addColorStop(stop, `#${this.tempColor.getHexString()}`);
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      eCtx.fillStyle = eGrad;
      eCtx.fillRect(0, 0, w, h);

      this.rodGradientTex.needsUpdate = true;
      this.rodEmissiveTex.needsUpdate = true;
    }

    this.rodOuterMaterial.roughness = matSpec.roughness;
    this.rodOuterMaterial.metalness = matSpec.metalness * 0.88;
  }

  /**
   * 每帧更新 3D 动效
   */
  public update(delta: number, telem: FourierConductionTelemetry): void {
    const dt = Math.min(0.1, Math.max(0, delta));
    this.clockTime += dt;

    // 1. 刷新左、中、右三块仪器数显屏
    this.renderHeaterControllerScreen(
      telem.hotTempC,
      telem.heaterDisplayPowerW,
      telem.heaterOn
    );
    this.renderFiveChannelMonitor(
      [
        telem.probes[0].temperatureC,
        telem.probes[1].temperatureC,
        telem.probes[2].temperatureC,
        telem.probes[3].temperatureC,
        telem.probes[4].temperatureC,
      ],
      telem.heaterOn
    );
    this.renderWaterBathFrontPanel(telem.coldTempC, telem.coolantOutletTempC);

    // 2. 刷新导热棒热成像金属表面与换棒机械动画
    this.updateRodThermalSurface(telem);
    const swapLift = Math.sin(telem.rodSwapProgress * Math.PI) * 0.016;
    this.testRodSwappableGroup.position.y =
      FourierConductionBenchMesh.ROD_CENTER_Y + swapLift;

    // 3. 左侧加热炉电热丝红热程度与电源船型开关倾角
    const hotFactor = telem.heaterOn
      ? Math.max(0.25, Math.min(1.6, (telem.hotTempC - 40) / 75))
      : 0.04;
    this.furnaceCoilMaterial.emissiveIntensity = hotFactor * 1.45;
    this.furnaceCoreGlowMat.opacity = telem.heaterOn
      ? 0.28 + hotFactor * 0.35 + Math.sin(this.clockTime * 6.0) * 0.04
      : 0.03;
    this.switchRockerMesh.rotation.x = telem.heaterOn ? -0.18 : 0.18;
    this.switchRockerMat.emissiveIntensity = telem.heaterOn ? 0.65 : 0.05;

    // 4. 更新导热棒内部声子/电子热流粒子
    const rodSpanLen = 0.376;
    const flowSpeed = telem.particleFlowSpeed * 0.28;
    const samples = telem.profileSamples;
    const sampleLast = samples.length - 1;

    for (let i = 0; i < this.heatParticleCount; i++) {
      let u = (this.heatParticlePhases[i] + dt * flowSpeed) % 1.0;
      if (u < 0) u += 1.0;
      this.heatParticlePhases[i] = u;

      const sIdx = Math.min(sampleLast, Math.max(0, Math.floor(u * sampleLast)));
      const localTempC = samples[sIdx].tempC;
      const vibAmp = 0.00035 + Math.max(0, (localTempC - 20) / 130) * 0.0012;
      const phaseAngle = this.clockTime * 14.0 + i * 1.71;

      const r = this.heatParticleRadialR[i];
      const theta = this.heatParticleRadialTheta[i];

      this.heatParticlePositions[i * 3] =
        (u - 0.5) * rodSpanLen + Math.sin(phaseAngle) * vibAmp;
      this.heatParticlePositions[i * 3 + 1] =
        Math.sin(theta) * r + Math.cos(phaseAngle * 1.3) * vibAmp;
      this.heatParticlePositions[i * 3 + 2] =
        Math.cos(theta) * r + Math.sin(phaseAngle * 0.9) * vibAmp;

      temperatureToThermalColor(localTempC, this.tempColor);
      this.heatParticleColors[i * 3] = this.tempColor.r;
      this.heatParticleColors[i * 3 + 1] = this.tempColor.g;
      this.heatParticleColors[i * 3 + 2] = this.tempColor.b;
    }
    (
      this.heatParticlesPoints.geometry.attributes.position as THREE.BufferAttribute
    ).needsUpdate = true;
    (
      this.heatParticlesPoints.geometry.attributes.color as THREE.BufferAttribute
    ).needsUpdate = true;

    // 5. 更新右侧透明换热腔螺旋盘管与双路蓝色硅胶管内的冷却水微气泡流动
    const coolantSpeed = 0.42 + Math.max(0, (40 - telem.coldTempC) / 35) * 0.25;
    for (let i = 0; i < this.coolantBubbleCount; i++) {
      const prog = (this.coolantBubbleProgress[i] + dt * coolantSpeed) % 1.0;
      this.coolantBubbleProgress[i] = prog;

      const pathIdx = this.coolantBubblePathIndex[i];
      const curve = this.coolantCurves[pathIdx];
      if (curve) {
        const pt = curve.getPoint(prog);
        this.coolantBubblePositions[i * 3] = pt.x;
        this.coolantBubblePositions[i * 3 + 1] = pt.y;
        this.coolantBubblePositions[i * 3 + 2] = pt.z;

        const warmShift = pathIdx === 1 ? prog * 0.25 : pathIdx === 0 ? prog * 0.18 : 0;
        this.coolantBubbleColors[i * 3] = 0.25 + warmShift;
        this.coolantBubbleColors[i * 3 + 1] = 0.82 + warmShift * 0.15;
        this.coolantBubbleColors[i * 3 + 2] = 1.0;
      }
    }
    (
      this.coolantBubblesPoints.geometry.attributes.position as THREE.BufferAttribute
    ).needsUpdate = true;
    (
      this.coolantBubblesPoints.geometry.attributes.color as THREE.BufferAttribute
    ).needsUpdate = true;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
    this.heaterDisplayTex?.dispose();
    this.monitorDisplayTex?.dispose();
    this.chillerDisplayTex?.dispose();
    this.rodGradientTex?.dispose();
    this.rodEmissiveTex?.dispose();
  }
}

import * as THREE from 'three';
import { labMetal, labGlow, labGlass, polishedGold, enameledCopper, createJumperLead } from './labKit.ts';
import { GalvanometerMesh } from './GalvanometerMesh.ts';
import { disposeObjectTree } from './disposeObject.ts';
import type { GeneratorOutputType } from '../../physics/em/generator.ts';

export interface GeneratorBenchSyncParams {
  angleRad: number;
  outputType: GeneratorOutputType;
  currentAmp: number;
  emfVolt: number;
  bulbBrightness: number;
  magFieldTesla?: number;
  turns?: number;
}

export class GeneratorBenchMesh {
  public readonly group = new THREE.Group();

  // 1. 独立立式检流计 G
  public readonly galvanometer: GalvanometerMesh;

  // 2. 发电机机械台架系统
  public readonly generatorGroup = new THREE.Group();
  public readonly rotorShaftGroup = new THREE.Group();
  public readonly crankHandleGroup = new THREE.Group();
  public readonly crankGripMesh: THREE.Mesh;

  // 3. 磁极靴与磁轭
  public readonly magnetShoeN: THREE.Mesh;
  public readonly magnetShoeS: THREE.Mesh;

  // 4. 输出机构：双滑环与半环换向器
  public readonly slipRingsGroup = new THREE.Group();
  public readonly commutatorGroup = new THREE.Group();
  public readonly brushGroup = new THREE.Group();

  // 5. 负载小灯泡系统
  public readonly bulbGroup = new THREE.Group();
  public readonly bulbFilamentMesh: THREE.Mesh;
  public readonly bulbLight: THREE.PointLight;

  // 材质
  private readonly castIronMat: THREE.MeshStandardMaterial;
  private readonly chromeMat: THREE.MeshStandardMaterial;
  private readonly brassMat: THREE.MeshStandardMaterial;
  private readonly bakeliteMat: THREE.MeshStandardMaterial;
  private readonly magnetMatN: THREE.MeshStandardMaterial;
  private readonly magnetMatS: THREE.MeshStandardMaterial;
  private readonly copperCoilMat: THREE.MeshStandardMaterial;
  private readonly filamentMat: THREE.MeshStandardMaterial;
  private readonly bulbGlassMat: THREE.MeshStandardMaterial;

  private currentOutputType: GeneratorOutputType = 'ac';

  constructor() {
    this.group.name = 'GeneratorBench';

    // 物理 PBR 材质
    this.castIronMat = labMetal(0x1e293b, 0.55, 0.65);
    this.chromeMat = labMetal(0xf1f5f9, 0.96, 0.12);
    this.brassMat = polishedGold(0xca8a04);
    this.bakeliteMat = labMetal(0x0f172a, 0.15, 0.45);
    this.copperCoilMat = enameledCopper();

    this.magnetMatN = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.25,
      roughness: 0.3,
    });
    this.magnetMatS = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      metalness: 0.25,
      roughness: 0.3,
    });

    this.filamentMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      emissive: 0xfef08a,
      emissiveIntensity: 0.0,
      metalness: 0.8,
      roughness: 0.2,
    });

    this.bulbGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.95,
      opacity: 1.0,
      transparent: true,
      roughness: 0.04,
      ior: 1.52,
      thickness: 0.002,
    });

    // 1. 实例化立式微安检流计 G
    this.galvanometer = new GalvanometerMesh();
    this.galvanometer.group.position.set(0.24, 0, 0.04);
    this.group.add(this.galvanometer.group);

    // 2. 构建发电机主体 (位于底座左侧)
    const genKit = this.buildGeneratorApparatus();
    this.generatorGroup.add(genKit.base);
    this.magnetShoeN = genKit.shoeN;
    this.magnetShoeS = genKit.shoeS;
    this.crankGripMesh = genKit.crankGrip;
    this.bulbFilamentMesh = genKit.filament;
    this.bulbLight = genKit.bulbLight;

    this.generatorGroup.position.set(-0.20, 0, 0.02);
    this.group.add(this.generatorGroup);

    // 3. 铺设实验导线 (真实悬链线物理导线)
    this.buildWiring();
  }

  /**
   * 构建高保真手摇发电机台架与旋转线圈系统 (严格参照照片 2 建模)
   */
  private buildGeneratorApparatus() {
    const apparatus = new THREE.Group();

    // 1. 铸造底座：采用倒角圆角 Shape 拉伸，非简单圆柱或生硬立方体！
    const baseW = 0.28;
    const baseL = 0.22;
    const baseH = 0.022;
    const baseRadius = 0.012;

    const baseShape = new THREE.Shape();
    const hw = baseW * 0.5;
    const hl = baseL * 0.5;
    const r = baseRadius;
    baseShape.moveTo(-hw + r, -hl);
    baseShape.lineTo(hw - r, -hl);
    baseShape.absarc(hw - r, -hl + r, r, -Math.PI * 0.5, 0, false);
    baseShape.lineTo(hw, hl - r);
    baseShape.absarc(hw - r, hl - r, r, 0, Math.PI * 0.5, false);
    baseShape.lineTo(-hw + r, hl);
    baseShape.absarc(-hw + r, hl - r, r, Math.PI * 0.5, Math.PI, false);
    baseShape.lineTo(-hw, -hl + r);
    baseShape.absarc(-hw + r, -hl + r, r, Math.PI, Math.PI * 1.5, false);

    const baseGeo = new THREE.ExtrudeGeometry(baseShape, {
      depth: baseH,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.003,
      bevelThickness: 0.003,
    });
    baseGeo.center();

    const baseMesh = new THREE.Mesh(baseGeo, this.castIronMat);
    baseMesh.rotation.x = -Math.PI * 0.5;
    baseMesh.position.set(0, baseH * 0.5 + 0.002, 0);
    apparatus.add(baseMesh);

    // 四角镀铬安装螺栓
    for (const dx of [-hw + 0.02, hw - 0.02]) {
      for (const dz of [-hl + 0.02, hl - 0.02]) {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0045, 0.0045, 0.006, 16),
          this.chromeMat
        );
        bolt.position.set(dx, baseH + 0.004, dz);
        apparatus.add(bolt);
      }
    }

    // 2. 双立柱主轴承支撑座 (前后对称支撑旋转主轴)
    const shaftAxisY = 0.125;
    const pillarZFront = 0.082;
    const pillarZBack = -0.082;

    for (const pz of [pillarZFront, pillarZBack]) {
      const pillarShape = new THREE.Shape();
      pillarShape.moveTo(-0.026, 0);
      pillarShape.lineTo(0.026, 0);
      pillarShape.lineTo(0.016, shaftAxisY + 0.018);
      pillarShape.absarc(0, shaftAxisY, 0.018, 0, Math.PI, false);
      pillarShape.lineTo(-0.026, 0);

      const pillarGeo = new THREE.ExtrudeGeometry(pillarShape, {
        depth: 0.014,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.0015,
        bevelThickness: 0.0015,
      });
      pillarGeo.center();

      const pillarMesh = new THREE.Mesh(pillarGeo, this.castIronMat);
      pillarMesh.position.set(0, (shaftAxisY + 0.018) * 0.5, pz);
      apparatus.add(pillarMesh);

      // 黄铜减磨滑动轴承套
      const bushing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0075, 0.0075, 0.018, 20),
        this.brassMat
      );
      bushing.rotation.x = Math.PI * 0.5;
      bushing.position.set(0, shaftAxisY, pz);
      apparatus.add(bushing);
    }

    // 3. 弧形马蹄形永磁极靴对 (严格还原照片 2 中的弧形极靴！)
    // 面向转子的内侧为圆弧内凹面，保证气隙均匀
    const poleGapRadius = 0.046; // 转子旋转外包络半径约 0.038
    const poleHeight = 0.09;
    const poleDepth = 0.12;

    // 左侧 N 极弧形极靴
    const shoeShapeN = new THREE.Shape();
    shoeShapeN.moveTo(-0.075, -poleHeight * 0.5);
    shoeShapeN.lineTo(-0.022, -poleHeight * 0.5);
    // 内凹圆弧
    shoeShapeN.absarc(0, 0, poleGapRadius, -Math.PI * 0.72, -Math.PI * 1.28, true);
    shoeShapeN.lineTo(-0.075, poleHeight * 0.5);
    shoeShapeN.lineTo(-0.075, -poleHeight * 0.5);

    const shoeGeoN = new THREE.ExtrudeGeometry(shoeShapeN, {
      depth: poleDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.002,
      bevelThickness: 0.002,
    });
    shoeGeoN.center();

    const shoeN = new THREE.Mesh(shoeGeoN, this.magnetMatN);
    shoeN.position.set(0, shaftAxisY, 0);
    apparatus.add(shoeN);

    // 右侧 S 极弧形极靴 (镜像对称)
    const shoeShapeS = new THREE.Shape();
    shoeShapeS.moveTo(0.075, -poleHeight * 0.5);
    shoeShapeS.lineTo(0.022, -poleHeight * 0.5);
    shoeShapeS.absarc(0, 0, poleGapRadius, -Math.PI * 0.28, Math.PI * 0.28, false);
    shoeShapeS.lineTo(0.075, poleHeight * 0.5);
    shoeShapeS.lineTo(0.075, -poleHeight * 0.5);

    const shoeGeoS = new THREE.ExtrudeGeometry(shoeShapeS, {
      depth: poleDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.002,
      bevelThickness: 0.002,
    });
    shoeGeoS.center();

    const shoeS = new THREE.Mesh(shoeGeoS, this.magnetMatS);
    shoeS.position.set(0, shaftAxisY, 0);
    apparatus.add(shoeS);

    // 4. 旋转主轴与转子线圈组件 (绕 Z 轴水平旋转)
    this.rotorShaftGroup.position.set(0, shaftAxisY, 0);

    // 贯穿不锈钢主轴
    const shaftTotalLen = 0.25;
    const mainShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, shaftTotalLen, 24),
      this.chromeMat
    );
    mainShaft.rotation.x = Math.PI * 0.5;
    this.rotorShaftGroup.add(mainShaft);

    // 转子铁芯骨架：圆角矩形
    const coilW = 0.052;
    const coilH = 0.074;
    const coilThick = 0.022;

    const rotorCoreShape = new THREE.Shape();
    const cr = 0.006;
    const rcw = coilW * 0.5;
    const rch = coilH * 0.5;
    rotorCoreShape.moveTo(-rcw + cr, -rch);
    rotorCoreShape.lineTo(rcw - cr, -rch);
    rotorCoreShape.absarc(rcw - cr, -rch + cr, cr, -Math.PI * 0.5, 0, false);
    rotorCoreShape.lineTo(rcw, rch - cr);
    rotorCoreShape.absarc(rcw - cr, rch - cr, cr, 0, Math.PI * 0.5, false);
    rotorCoreShape.lineTo(-rcw + cr, rch);
    rotorCoreShape.absarc(-rcw + cr, rch - cr, cr, Math.PI * 0.5, Math.PI, false);
    rotorCoreShape.lineTo(-rcw, -rch + cr);
    rotorCoreShape.absarc(-rcw + cr, -rch + cr, cr, Math.PI, Math.PI * 1.5, false);

    const rotorCoreGeo = new THREE.ExtrudeGeometry(rotorCoreShape, {
      depth: coilThick,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.002,
      bevelThickness: 0.002,
    });
    rotorCoreGeo.center();

    const rotorCoilMesh = new THREE.Mesh(rotorCoreGeo, this.copperCoilMat);
    this.rotorShaftGroup.add(rotorCoilMesh);

    // 5. 输出机构：双滑环 (AC) 与半环换向器 (DC)
    // 位于后立柱前方 (z 在 -0.04 到 -0.07 区间)
    this.slipRingsGroup.position.set(0, 0, -0.052);
    const ring1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.005, 24),
      this.brassMat
    );
    ring1.rotation.x = Math.PI * 0.5;
    ring1.position.z = -0.004;
    this.slipRingsGroup.add(ring1);

    const ring2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.005, 24),
      this.brassMat
    );
    ring2.rotation.x = Math.PI * 0.5;
    ring2.position.z = 0.004;
    this.slipRingsGroup.add(ring2);

    this.rotorShaftGroup.add(this.slipRingsGroup);

    // 换向器 (两半圆铜筒，中间留有绝缘缝隙)
    this.commutatorGroup.position.set(0, 0, -0.066);
    const commHalf1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.008, 16, 1, false, 0, Math.PI * 0.88),
      this.brassMat
    );
    commHalf1.rotation.x = Math.PI * 0.5;
    this.commutatorGroup.add(commHalf1);

    const commHalf2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.008, 16, 1, false, Math.PI, Math.PI * 0.88),
      this.brassMat
    );
    commHalf2.rotation.x = Math.PI * 0.5;
    this.commutatorGroup.add(commHalf2);

    this.rotorShaftGroup.add(this.commutatorGroup);

    // 6. 弹性磷青铜电刷架 (固定在台座上)
    this.brushGroup.position.set(0, shaftAxisY, -0.052);
    const brushLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.0025, 0.008),
      labMetal(0xd97706, 0.75, 0.2)
    );
    brushLeft.position.set(-0.012, 0, 0);
    this.brushGroup.add(brushLeft);

    const brushRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.0025, 0.008),
      labMetal(0xd97706, 0.75, 0.2)
    );
    brushRight.position.set(0.012, 0, 0);
    this.brushGroup.add(brushRight);
    apparatus.add(this.brushGroup);

    // 7. 连续平滑弯折手摇手柄 (采用 TubeGeometry + CurvePath，禁止生硬拼凑圆柱！)
    this.crankHandleGroup.position.set(0, 0, pillarZFront + 0.012);

    const crankPath = new THREE.CurvePath<THREE.Vector3>();
    // 轴端延伸
    crankPath.add(new THREE.LineCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0.024)
    ));
    // 弯折到力臂方向 (+Y)
    crankPath.add(new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0.024),
      new THREE.Vector3(0, 0, 0.032),
      new THREE.Vector3(0, 0.010, 0.032),
      new THREE.Vector3(0, 0.018, 0.032)
    ));
    // 向上力臂
    crankPath.add(new THREE.LineCurve3(
      new THREE.Vector3(0, 0.018, 0.032),
      new THREE.Vector3(0, 0.076, 0.032)
    ));
    // 弯折到向前握把方向 (+Z)
    crankPath.add(new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0.076, 0.032),
      new THREE.Vector3(0, 0.084, 0.032),
      new THREE.Vector3(0, 0.084, 0.040),
      new THREE.Vector3(0, 0.084, 0.048)
    ));
    // 握把销轴延伸
    crankPath.add(new THREE.LineCurve3(
      new THREE.Vector3(0, 0.084, 0.048),
      new THREE.Vector3(0, 0.084, 0.085)
    ));

    const crankGeo = new THREE.TubeGeometry(crankPath, 48, 0.005, 16, false);
    const crankArmMesh = new THREE.Mesh(crankGeo, this.chromeMat);
    this.crankHandleGroup.add(crankArmMesh);

    // 旋转握持手柄 (车削倒角实木/胶木手柄套，套在末端握把销轴上)
    const gripGeo = new THREE.CylinderGeometry(0.010, 0.008, 0.036, 20);
    const crankGrip = new THREE.Mesh(gripGeo, this.bakeliteMat);
    crankGrip.rotation.x = Math.PI * 0.5;
    crankGrip.position.set(0, 0.084, 0.066);
    this.crankHandleGroup.add(crankGrip);

    this.rotorShaftGroup.add(this.crankHandleGroup);
    apparatus.add(this.rotorShaftGroup);

    // 8. 负载小灯泡与微型灯座 (安装在台座前右侧，如照片 2 中所示)
    this.bulbGroup.position.set(0.085, baseH + 0.002, 0.05);

    // 螺口金属底座
    const bulbSocket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.013, 0.014, 20),
      this.brassMat
    );
    bulbSocket.position.set(0, 0.007, 0);
    this.bulbGroup.add(bulbSocket);

    // 透明玻璃球泡
    const bulbGlass = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 24, 20),
      this.bulbGlassMat
    );
    bulbGlass.position.set(0, 0.022, 0);
    this.bulbGroup.add(bulbGlass);

    // 微型双脚支撑丝与螺旋发光灯丝
    const filament = new THREE.Mesh(
      new THREE.TorusGeometry(0.0035, 0.0008, 8, 16),
      this.filamentMat
    );
    filament.rotation.x = Math.PI * 0.5;
    filament.position.set(0, 0.021, 0);
    this.bulbGroup.add(filament);

    // 动态暖黄光点光源
    const bulbLight = new THREE.PointLight(0xfef08a, 0, 0.45);
    bulbLight.position.set(0, 0.022, 0);
    this.bulbGroup.add(bulbLight);

    apparatus.add(this.bulbGroup);

    return {
      base: apparatus,
      shoeN,
      shoeS,
      crankGrip,
      filament,
      bulbLight,
    };
  }

  /**
   * 铺设真实物理悬链线柔性导线 (电刷输出端 -> 灯泡负载 -> 检流计 G)
   */
  private buildWiring(): void {
    // 1. 发电机正极电刷 -> 负载灯泡座 (红色硅胶导线)
    const wire1 = createJumperLead([
      new THREE.Vector3(-0.21, 0.12, -0.03),
      new THREE.Vector3(-0.16, 0.04, 0.01),
      new THREE.Vector3(-0.12, 0.03, 0.05),
      new THREE.Vector3(-0.115, 0.035, 0.07),
    ], 0xdc2626, 0.0028);
    this.group.add(wire1);

    // 2. 负载灯泡座引出 -> 检流计红色正输入端 (红色导线横跨台面)
    const wire2 = createJumperLead([
      new THREE.Vector3(-0.105, 0.035, 0.07),
      new THREE.Vector3(0.02, 0.014, 0.16),
      new THREE.Vector3(0.18, 0.014, 0.14),
      new THREE.Vector3(0.305, 0.046, 0.11),
    ], 0xdc2626, 0.0030);
    this.group.add(wire2);

    // 3. 发电机负极电刷 -> 检流计黑色负输入端 (黑色导线躺平连通)
    const wire3 = createJumperLead([
      new THREE.Vector3(-0.19, 0.12, -0.03),
      new THREE.Vector3(-0.06, 0.014, -0.04),
      new THREE.Vector3(0.08, 0.014, 0.02),
      new THREE.Vector3(0.175, 0.046, 0.11),
    ], 0x0f172a, 0.0030);
    this.group.add(wire3);
  }

  public setRotorAngle(angleRad: number): void {
    this.rotorShaftGroup.rotation.z = angleRad;
  }

  public setOutputType(type: GeneratorOutputType): void {
    this.currentOutputType = type;
    if (type === 'ac') {
      this.brushGroup.position.z = -0.052; // 对齐双滑环
      this.slipRingsGroup.visible = true;
      this.commutatorGroup.visible = false;
    } else {
      this.brushGroup.position.z = -0.066; // 对齐换向器
      this.slipRingsGroup.visible = false;
      this.commutatorGroup.visible = true;
    }
  }

  public getOutputType(): GeneratorOutputType {
    return this.currentOutputType;
  }

  public updateNeedle(normalizedAngle: number): void {
    this.galvanometer.setNeedle(normalizedAngle);
  }

  public updateBulbBrightness(brightness: number): void {
    const clamped = Math.max(0, Math.min(1.0, brightness));
    this.filamentMat.emissiveIntensity = clamped * 2.5;
    this.bulbLight.intensity = clamped * 1.8;
  }

  public sync(params: GeneratorBenchSyncParams): void {
    this.setRotorAngle(params.angleRad);
    if (params.outputType !== this.currentOutputType) {
      this.setOutputType(params.outputType);
    }
    // 检流计针偏转
    const currentUa = params.currentAmp * 1e6;
    const normalizedNeedle = Math.max(-1.1, Math.min(1.1, currentUa / 300));
    this.updateNeedle(normalizedNeedle);
    this.updateBulbBrightness(params.bulbBrightness);
  }

  public dispose(): void {
    this.galvanometer.dispose();
    disposeObjectTree(this.group);
  }
}

import * as THREE from 'three';
import { labMetal, labGlow, labGlass, polishedGold, enameledCopper, createJumperLead } from './labKit.ts';
import { GalvanometerMesh } from './GalvanometerMesh.ts';
import { disposeObjectTree } from './disposeObject.ts';
import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export const COIL_AXIS_Y = 0.108;

export interface InductionBenchSyncParams {
  axial: number;
  poleSign: 1 | -1;
  probeAxial?: number;
  turns?: number;
  currentAmp: number;
  magnetField?: number;
  inducedField?: number;
}

export interface InductionBenchMeshOptions {
  computeBridge?: ComputeBridge;
}

export class InductionBenchMesh {
  public readonly group = new THREE.Group();
  public computeBridge?: ComputeBridge;

  // 1. 独立高精度立式检流计 G
  public readonly galvanometer: GalvanometerMesh;

  // 2. 铁架台与螺线管系统
  public readonly standGroup = new THREE.Group();
  public readonly barMagnetGroup = new THREE.Group();
  public readonly magnetMesh: THREE.Mesh;
  public readonly solenoidCoilMesh: THREE.Mesh;

  // 3. 铜闸刀开关
  public readonly knifeSwitchGroup = new THREE.Group();
  public readonly switchBladeGroup = new THREE.Group();
  public readonly switchHandleMesh: THREE.Mesh;

  // 4. 楞次定律感应磁场动态矢量
  private readonly lenzArrowGroup = new THREE.Group();
  private readonly lenzArrowShaft: THREE.Mesh;
  private readonly lenzArrowCone: THREE.Mesh;
  private readonly inducedRingsGroup = new THREE.Group();
  private readonly inducedRings: THREE.Mesh[] = [];

  // 材质
  private readonly castIronMat: THREE.MeshStandardMaterial;
  private readonly chromeMat: THREE.MeshStandardMaterial;
  private readonly copperCoilMat: THREE.MeshStandardMaterial;
  private readonly brassMat: THREE.MeshStandardMaterial;
  private readonly bakeliteMat: THREE.MeshStandardMaterial;
  private readonly magnetMatN: THREE.MeshStandardMaterial;
  private readonly magnetMatS: THREE.MeshStandardMaterial;

  private isSwitchClosed = true;
  private magnetPolarity: 1 | -1 = 1;

  constructor(options: InductionBenchMeshOptions = {}) {
    this.computeBridge = options.computeBridge;
    this.group.name = 'InductionBench';

    // 工业级真实物理 PBR 材质
    this.castIronMat = labMetal(0x181e24, 0.45, 0.68);
    this.chromeMat = labMetal(0xe2e8f0, 0.96, 0.12);
    this.brassMat = polishedGold(0xca8a04);
    this.bakeliteMat = labMetal(0x18181b, 0.15, 0.42);

    // 漆包线材质（高反光光泽 + 金属质感）
    this.copperCoilMat = new THREE.MeshStandardMaterial({
      color: 0xc25e00,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.15,
      metalness: 0.88,
      roughness: 0.22,
    });

    // 烤漆条形磁铁（红N蓝S）
    this.magnetMatN = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.25,
      metalness: 0.2,
    });
    this.magnetMatS = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.25,
      metalness: 0.2,
    });

    // 1. 实例化立式检流计 G
    this.galvanometer = new GalvanometerMesh();
    this.galvanometer.group.position.set(0.24, 0, 0.04);
    this.group.add(this.galvanometer.group);

    // 2. 构建立式铁架台与演示螺线管 (还原照片 1)
    const standKit = this.buildStandAndSolenoid();
    this.standGroup.add(standKit.stand);
    this.solenoidCoilMesh = standKit.coilMesh;
    this.magnetMesh = standKit.magnetMesh;
    this.lenzArrowShaft = standKit.lenzShaft;
    this.lenzArrowCone = standKit.lenzCone;
    this.standGroup.position.set(-0.22, 0, -0.02);
    this.group.add(this.standGroup);

    // 3. 构建铜闸刀开关 (还原照片 1)
    const switchKit = this.buildKnifeSwitch();
    this.knifeSwitchGroup.add(switchKit.base);
    this.switchBladeGroup.add(switchKit.blade);
    this.knifeSwitchGroup.add(this.switchBladeGroup);
    this.switchHandleMesh = switchKit.handle;
    this.knifeSwitchGroup.position.set(-0.02, 0, 0.22);
    this.group.add(this.knifeSwitchGroup);

    // 4. 构建真实悬链线物理导线
    this.buildWiring();

    this.setSwitchClosed(true);
    this.setMagnetPolarity(1);
    this.setMagnetHeight(0.26);
  }

  /**
   * 构建带有倒角台阶底座的铁架台与高精细螺线管
   */
  private buildStandAndSolenoid(): {
    stand: THREE.Group;
    coilMesh: THREE.Mesh;
    magnetMesh: THREE.Mesh;
    lenzShaft: THREE.Mesh;
    lenzCone: THREE.Mesh;
  } {
    const stand = new THREE.Group();

    // 1. 厚重铸铁实验台底座 (采用 ExtrudeGeometry 实现带圆角及阶梯凸台造型，非普通方块)
    const baseW = 0.26;
    const baseD = 0.22;
    const baseRadius = 0.016;

    const baseShape = new THREE.Shape();
    baseShape.moveTo(-baseW * 0.5 + baseRadius, -baseD * 0.5);
    baseShape.lineTo( baseW * 0.5 - baseRadius, -baseD * 0.5);
    baseShape.absarc( baseW * 0.5 - baseRadius, -baseD * 0.5 + baseRadius, baseRadius, -Math.PI * 0.5, 0, false);
    baseShape.lineTo( baseW * 0.5,  baseD * 0.5 - baseRadius);
    baseShape.absarc( baseW * 0.5 - baseRadius,  baseD * 0.5 - baseRadius, baseRadius, 0, Math.PI * 0.5, false);
    baseShape.lineTo(-baseW * 0.5 + baseRadius,  baseD * 0.5);
    baseShape.absarc(-baseW * 0.5 + baseRadius,  baseD * 0.5 - baseRadius, baseRadius, Math.PI * 0.5, Math.PI, false);
    baseShape.lineTo(-baseW * 0.5, -baseD * 0.5 + baseRadius);
    baseShape.absarc(-baseW * 0.5 + baseRadius, -baseD * 0.5 + baseRadius, baseRadius, Math.PI, Math.PI * 1.5, false);

    const baseGeo = new THREE.ExtrudeGeometry(baseShape, {
      depth: 0.026,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.004,
      bevelThickness: 0.004,
    });
    baseGeo.center();

    const baseMesh = new THREE.Mesh(baseGeo, this.castIronMat);
    baseMesh.rotation.x = Math.PI * 0.5;
    baseMesh.position.set(0, 0.013, 0);
    stand.add(baseMesh);

    // 四角防震橡胶避震脚
    for (let dx of [-0.11, 0.11]) {
      for (let dz of [-0.09, 0.09]) {
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.014, 0.008, 16),
          this.bakeliteMat
        );
        foot.position.set(dx, 0.004, dz);
        stand.add(foot);
      }
    }

    // 2. 镜面镀铬不锈钢立柱杆 (后左侧固定孔)
    const rodH = 0.44;
    const rodMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0075, 0.0075, rodH, 24),
      this.chromeMat
    );
    rodMesh.position.set(-0.08, rodH * 0.5 + 0.026, -0.05);
    stand.add(rodMesh);

    // 立柱双十字紧固套筒与手拧锁紧螺栓
    const collarMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.036, 0.036),
      this.castIronMat
    );
    collarMesh.position.set(-0.08, 0.33, -0.05);
    stand.add(collarMesh);

    // 十字滚花手拧旋钮
    const thumbKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.016, 16),
      this.bakeliteMat
    );
    thumbKnob.rotation.z = Math.PI * 0.5;
    thumbKnob.position.set(-0.10, 0.33, -0.05);
    stand.add(thumbKnob);

    // 水平延伸悬臂杆
    const armMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.13, 20),
      this.chromeMat
    );
    armMesh.rotation.z = Math.PI * 0.5;
    armMesh.position.set(-0.015, 0.33, -0.05);
    stand.add(armMesh);

    // 悬臂末端定位导向环圈 (Holding guide ring right above the solenoid bore, 完全吻合照片1中的导向环结构！)
    const guideRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.018, 0.0035, 16, 32),
      this.castIronMat
    );
    guideRing.rotation.x = Math.PI * 0.5;
    guideRing.position.set(0.04, 0.33, 0.01);
    stand.add(guideRing);

    // 3. 经典演示螺线管 (位于底座中央稍前)
    const solenoidGroup = new THREE.Group();
    solenoidGroup.position.set(0.04, 0.026, 0.01);

    // 下部带安装座的法兰盘
    const bottomFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.058, 0.018, 36),
      this.bakeliteMat
    );
    bottomFlange.position.set(0, 0.009, 0);
    solenoidGroup.add(bottomFlange);

    // 上部工程法兰盘 (带圆周均布 6 颗内六角螺丝沉头孔，还原照片 1！)
    const topFlangeGroup = new THREE.Group();
    topFlangeGroup.position.set(0, 0.155, 0);

    const topFlangeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.056, 0.018, 36),
      this.bakeliteMat
    );
    topFlangeGroup.add(topFlangeMesh);

    // 6 颗沉头螺栓
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const screwHole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.004, 12),
        labMetal(0x64748b, 0.8, 0.2)
      );
      screwHole.position.set(Math.cos(angle) * 0.044, 0.009, Math.sin(angle) * 0.044);
      topFlangeGroup.add(screwHole);
    }
    solenoidGroup.add(topFlangeGroup);

    // 螺线管内胆空心中空管 (磁铁穿梭通道)
    const boreTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.023, 0.023, 0.17, 32, 1, true),
      labMetal(0x020617, 0.2, 0.8)
    );
    boreTube.position.set(0, 0.082, 0);
    solenoidGroup.add(boreTube);

    // 螺线管外层密绕漆包铜线圈绕组 (表面带有高反光细腻漆包铜质感)
    const coilWinding = new THREE.Mesh(
      new THREE.CylinderGeometry(0.051, 0.051, 0.13, 36),
      this.copperCoilMat
    );
    coilWinding.position.set(0, 0.082, 0);
    solenoidGroup.add(coilWinding);

    // 底座端子引出接线柱 (红色正极在左，黑色负极在右)
    const postRed = this.createMachinedTerminal(0xdc2626);
    postRed.position.set(-0.03, 0.018, 0.046);
    solenoidGroup.add(postRed);

    const postBlack = this.createMachinedTerminal(0x0f172a);
    postBlack.position.set(0.03, 0.018, 0.046);
    solenoidGroup.add(postBlack);

    stand.add(solenoidGroup);

    // 4. 精密倒角方柱形条形磁铁 (高保真制作，带清晰大字“N”与“S”烤漆，非简陋圆柱拼接！)
    const magnetLen = 0.13;
    const magnetHalf = magnetLen * 0.5;
    const magnetWidth = 0.022;

    this.barMagnetGroup.name = 'BarMagnet';
    this.barMagnetGroup.position.set(0.04, 0.26, 0.01);

    // 带有圆弧倒角的方形磁铁截面
    const magnetShape = new THREE.Shape();
    const mw = magnetWidth;
    const mr = 0.0025;
    magnetShape.moveTo(-mw * 0.5 + mr, -mw * 0.5);
    magnetShape.lineTo( mw * 0.5 - mr, -mw * 0.5);
    magnetShape.absarc( mw * 0.5 - mr, -mw * 0.5 + mr, mr, -Math.PI * 0.5, 0, false);
    magnetShape.lineTo( mw * 0.5,  mw * 0.5 - mr);
    magnetShape.absarc( mw * 0.5 - mr,  mw * 0.5 - mr, mr, 0, Math.PI * 0.5, false);
    magnetShape.lineTo(-mw * 0.5 + mr,  mw * 0.5);
    magnetShape.absarc(-mw * 0.5 + mr,  mw * 0.5 - mr, mr, Math.PI * 0.5, Math.PI, false);
    magnetShape.lineTo(-mw * 0.5, -mw * 0.5 + mr);
    magnetShape.absarc(-mw * 0.5 + mr, -mw * 0.5 + mr, mr, Math.PI, Math.PI * 1.5, false);

    // 上半截红 N 极
    const northGeo = new THREE.ExtrudeGeometry(magnetShape, {
      depth: magnetHalf,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.001,
      bevelThickness: 0.001,
    });
    northGeo.center();

    const northMesh = new THREE.Mesh(northGeo, this.magnetMatN);
    northMesh.rotation.x = Math.PI * 0.5;
    northMesh.position.set(0, magnetHalf * 0.5, 0);
    this.barMagnetGroup.add(northMesh);

    // 下半截蓝 S 极
    const southGeo = new THREE.ExtrudeGeometry(magnetShape, {
      depth: magnetHalf,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.001,
      bevelThickness: 0.001,
    });
    southGeo.center();

    const southMesh = new THREE.Mesh(southGeo, this.magnetMatS);
    southMesh.rotation.x = Math.PI * 0.5;
    southMesh.position.set(0, -magnetHalf * 0.5, 0);
    this.barMagnetGroup.add(southMesh);

    // 刻制醒目纯白“N”与“S”字样标牌
    const nTex = this.createLetterTexture('N', '#ffffff');
    const sTex = this.createLetterTexture('S', '#ffffff');
    for (let angle of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
      const nPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.016, 0.024),
        new THREE.MeshBasicMaterial({ map: nTex, transparent: true })
      );
      nPlate.rotation.y = angle;
      nPlate.position.set(
        Math.sin(angle) * (magnetWidth * 0.5 + 0.0006),
        magnetHalf * 0.5,
        Math.cos(angle) * (magnetWidth * 0.5 + 0.0006)
      );
      this.barMagnetGroup.add(nPlate);

      const sPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.016, 0.024),
        new THREE.MeshBasicMaterial({ map: sTex, transparent: true })
      );
      sPlate.rotation.y = angle;
      sPlate.position.set(
        Math.sin(angle) * (magnetWidth * 0.5 + 0.0006),
        -magnetHalf * 0.5,
        Math.cos(angle) * (magnetWidth * 0.5 + 0.0006)
      );
      this.barMagnetGroup.add(sPlate);
    }

    // 磁铁顶端金属悬挂提环
    const topRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.009, 0.0025, 16, 24),
      this.brassMat
    );
    topRing.rotation.x = Math.PI * 0.5;
    topRing.position.set(0, magnetHalf + 0.01, 0);
    this.barMagnetGroup.add(topRing);

    stand.add(this.barMagnetGroup);

    // 5. 楞次定律动态发光感应磁场矢量箭头 (绿色/琥珀色)
    this.lenzArrowGroup.position.set(0.04, 0.108, 0.01);
    this.lenzArrowGroup.visible = false;

    const arrowMat = labGlow(0x10b981, 0.85);
    const lenzShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.075, 16),
      arrowMat
    );
    lenzShaft.position.set(0, 0.038, 0);
    this.lenzArrowGroup.add(lenzShaft);

    const lenzCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.009, 0.022, 16),
      arrowMat
    );
    lenzCone.position.set(0, 0.082, 0);
    this.lenzArrowGroup.add(lenzCone);

    stand.add(this.lenzArrowGroup);

    return {
      stand,
      coilMesh: coilWinding,
      magnetMesh: northMesh,
      lenzShaft,
      lenzCone,
    };
  }

  /**
   * 构建经典双簧片青铜闸刀开关 (还原照片 1 前方底座)
   */
  private buildKnifeSwitch(): {
    base: THREE.Group;
    blade: THREE.Group;
    handle: THREE.Mesh;
  } {
    const base = new THREE.Group();

    // 绝缘胶木底座 (圆角板)
    const swShape = new THREE.Shape();
    const swW = 0.13;
    const swD = 0.065;
    const swR = 0.008;
    swShape.moveTo(-swW * 0.5 + swR, -swD * 0.5);
    swShape.lineTo( swW * 0.5 - swR, -swD * 0.5);
    swShape.absarc( swW * 0.5 - swR, -swD * 0.5 + swR, swR, -Math.PI * 0.5, 0, false);
    swShape.lineTo( swW * 0.5,  swD * 0.5 - swR);
    swShape.absarc( swW * 0.5 - swR,  swD * 0.5 - swR, swR, 0, Math.PI * 0.5, false);
    swShape.lineTo(-swW * 0.5 + swR,  swD * 0.5);
    swShape.absarc(-swW * 0.5 + swR,  swD * 0.5 - swR, swR, Math.PI * 0.5, Math.PI, false);
    swShape.lineTo(-swW * 0.5, -swD * 0.5 + swR);
    swShape.absarc(-swW * 0.5 + swR, -swD * 0.5 + swR, swR, Math.PI, Math.PI * 1.5, false);

    const swBaseGeo = new THREE.ExtrudeGeometry(swShape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.002,
      bevelThickness: 0.002,
    });
    swBaseGeo.center();

    const swBaseMesh = new THREE.Mesh(swBaseGeo, this.bakeliteMat);
    swBaseMesh.rotation.x = Math.PI * 0.5;
    swBaseMesh.position.set(0, 0.008, 0);
    base.add(swBaseMesh);

    // 纯铜铰链支架 (左)
    const hingeBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.024, 0.016),
      this.brassMat
    );
    hingeBracket.position.set(-0.04, 0.024, 0);
    base.add(hingeBracket);

    // 双簧片夹刀卡座 (右)
    const jawClip = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.026, 0.014),
      this.brassMat
    );
    jawClip.position.set(0.04, 0.024, 0);
    base.add(jawClip);

    // 开关左右两枚接线端子
    const postIn = this.createMachinedTerminal(0xca8a04);
    postIn.position.set(-0.04, 0.018, 0.022);
    base.add(postIn);

    const postOut = this.createMachinedTerminal(0xca8a04);
    postOut.position.set(0.04, 0.018, 0.022);
    base.add(postOut);

    // 可旋转铜刀臂与圆柱手柄
    const blade = new THREE.Group();
    blade.position.set(-0.04, 0.028, 0); // 铰链旋转轴

    const copperBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.078, 0.006, 0.0035),
      this.brassMat
    );
    copperBlade.position.set(0.039, 0, 0);
    blade.add(copperBlade);

    // 人体工学黑色圆柱手柄
    const handleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0075, 0.0075, 0.038, 16),
      this.bakeliteMat
    );
    handleMesh.rotation.z = Math.PI * 0.5;
    handleMesh.position.set(0.088, 0, 0);
    blade.add(handleMesh);

    return { base, blade, handle: handleMesh };
  }

  /**
   * 生成文字贴图 (用于磁铁表面 N / S 极标牌)
   */
  private createLetterTexture(letter: string, color: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, 256, 384);
      ctx.font = '900 240px "SF Pro Display", sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, 128, 192);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createMachinedTerminal(capColor: number): THREE.Group {
    const post = new THREE.Group();
    const screw = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.018, 16),
      this.brassMat
    );
    post.add(screw);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.009, 16),
      new THREE.MeshStandardMaterial({ color: capColor, metalness: 0.25, roughness: 0.35 })
    );
    cap.position.set(0, 0.012, 0);
    post.add(cap);
    return post;
  }

  /**
   * 铺设真实物理悬链线柔性导线 (完全对照真实照片 1 的连线布局)
   */
  private buildWiring(): void {
    // 1. 螺线管正极 -> 闸刀开关左接线端子 (红色硅胶导线，自然垂落在底座上)
    const wire1 = createJumperLead([
      new THREE.Vector3(-0.25, 0.046, 0.036),
      new THREE.Vector3(-0.18, 0.012, 0.12),
      new THREE.Vector3(-0.10, 0.012, 0.22),
      new THREE.Vector3(-0.06, 0.026, 0.242),
    ], 0xdc2626, 0.0032);
    this.group.add(wire1);

    // 2. 闸刀开关右接线端子 -> 检流计红色正输入端 (红色硅胶导线，蜿蜒横穿桌面)
    const wire2 = createJumperLead([
      new THREE.Vector3(0.02, 0.026, 0.242),
      new THREE.Vector3(0.12, 0.012, 0.25),
      new THREE.Vector3(0.24, 0.012, 0.18),
      new THREE.Vector3(0.305, 0.046, 0.11),
    ], 0xdc2626, 0.0032);
    this.group.add(wire2);

    // 3. 螺线管负极 -> 检流计黑色负输入端 (黑色导线，平整躺平在台面上直接连通)
    const wire3 = createJumperLead([
      new THREE.Vector3(-0.19, 0.046, 0.036),
      new THREE.Vector3(-0.08, 0.012, 0.08),
      new THREE.Vector3(0.08, 0.012, 0.06),
      new THREE.Vector3(0.175, 0.046, 0.11),
    ], 0x0f172a, 0.0032);
    this.group.add(wire3);
  }

  public setMagnetHeight(heightM: number): void {
    const clampedY = Math.max(-0.06, Math.min(0.36, heightM));
    this.barMagnetGroup.position.y = clampedY;
  }

  public getMagnetHeight(): number {
    return this.barMagnetGroup.position.y;
  }

  public setMagnetPolarity(orientation: 1 | -1): void {
    this.magnetPolarity = orientation;
    this.barMagnetGroup.rotation.x = orientation === 1 ? 0 : Math.PI;
  }

  public getMagnetPolarity(): 1 | -1 {
    return this.magnetPolarity;
  }

  public setSwitchClosed(closed: boolean): void {
    this.isSwitchClosed = closed;
    // 闭合为 0 度咬合，断开向上抬起 35 度
    this.switchBladeGroup.rotation.z = closed ? 0 : -Math.PI * 0.24;
  }

  public isSwitchOpen(): boolean {
    return !this.isSwitchClosed;
  }

  public updateNeedle(normalizedAngle: number): void {
    this.galvanometer.setNeedle(normalizedAngle);
  }

  public updateLenzVisual(dPhiDt: number, direction: 1 | 0 | -1, currentUa: number): void {
    if (Math.abs(dPhiDt) > 1e-7 && this.isSwitchClosed && direction !== 0) {
      this.lenzArrowGroup.visible = true;
      this.lenzArrowGroup.rotation.x = direction === 1 ? 0 : Math.PI;
      const intensity = Math.min(1.5, Math.abs(currentUa) / 100);
      const shaftMat = this.lenzArrowShaft.material as THREE.MeshStandardMaterial;
      shaftMat.emissiveIntensity = 0.4 + intensity * 0.8;
    } else {
      this.lenzArrowGroup.visible = false;
    }
  }

  public sync(params: InductionBenchSyncParams): void {
    this.setMagnetHeight(COIL_AXIS_Y + params.axial);
    this.setMagnetPolarity(params.poleSign);
    const currentUa = params.currentAmp * 1e6;
    const normalizedNeedle = Math.max(-1.1, Math.min(1.1, currentUa / 300));
    this.updateNeedle(normalizedNeedle);
    const indField = params.inducedField ?? 0;
    const dir: 1 | 0 | -1 = Math.abs(indField) > 1e-8 ? (indField > 0 ? 1 : -1) : 0;
    this.updateLenzVisual(indField, dir, currentUa);
  }

  public dispose(): void {
    this.galvanometer.dispose();
    disposeObjectTree(this.group);
  }
}

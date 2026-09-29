import * as THREE from 'three';
import { MASS_STAGE, trajectoryPoint } from '../../physics/em/massSpec.ts';
import { disposeObjectTree } from './disposeObject.ts';
import {
  anodizedAluminum,
  enameledCopper,
  labGlass,
  labGlow,
  labMetal,
  opticalQuartz,
  outlined,
  plateTexture,
  polishedGold,
  ReadoutPanel,
  softDiscTexture,
} from './labKit.ts';

import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export interface IonVisual {
  visible: boolean;
  x: number;
  y: number;
  color: number;
  opacity: number;
  spotVisible: boolean;
  spotY: number;
  magVisible: boolean;
  magX: number;
}

export interface MassSpecVisual {
  jawOpening: number;
  accelVoltage: number;
  plateVoltage: number;
  analyzerBz: number;
  probeX: number;
  ions: IonVisual[];
}

export interface MassSpecBenchMeshOptions {
  computeBridge?: ComputeBridge;
}

export class MassSpecBenchMesh {
  public readonly group = new THREE.Group();
  public readonly sourceGroup = new THREE.Group();
  public readonly jawGroup = new THREE.Group();
  public readonly magnetGroup = new THREE.Group();
  public readonly accelKnob = new THREE.Group();
  public readonly selectorKnob = new THREE.Group();
  public readonly probeGroup = new THREE.Group();
  public computeBridge?: ComputeBridge;

  // tests/boost_multicore_fix.test.ts 不变量测试所需属性
  private readonly trails: THREE.BufferAttribute[] = [];
  private readonly trailLines: THREE.Line[] = [];
  private readonly trailHist: Array<Array<[number, number]>> = [[], [], [], []];
  private readonly ionMeshes: THREE.Mesh[] = [];
  private readonly halos: THREE.Sprite[] = [];
  private readonly spotMeshes: THREE.Mesh[] = [];
  private readonly magMeshes: THREE.Mesh[] = [];

  private readonly upperJaw: THREE.Mesh;
  private readonly lowerJaw: THREE.Mesh;
  private readonly nearPole: THREE.Mesh;
  private readonly farPole: THREE.Mesh;
  private readonly poleLabelN: THREE.Mesh;
  private readonly poleLabelS: THREE.Mesh;

  private readonly redMat: THREE.MeshStandardMaterial;
  private readonly blueMat: THREE.MeshStandardMaterial;
  private readonly chassisMat: THREE.MeshStandardMaterial;
  private readonly aluminumMat: THREE.MeshStandardMaterial;
  private readonly goldMat: THREE.MeshStandardMaterial;
  private readonly copperMat: THREE.MeshStandardMaterial;
  private readonly chromeMat: THREE.MeshStandardMaterial;
  private readonly darkScreenMat: THREE.MeshStandardMaterial;
  private readonly readout: ReadoutPanel;

  constructor(options: MassSpecBenchMeshOptions = {}) {
    this.computeBridge = options.computeBridge;
    this.group.name = 'MassSpecBench';

    this.redMat = labGlow(0xef4444, 0.6);
    this.blueMat = labGlow(0x2563eb, 0.6);
    this.chassisMat = labMetal(0x1e293b, 0.75, 0.3);
    this.aluminumMat = anodizedAluminum(0x94a3b8, 0.22);
    this.goldMat = polishedGold(0xd4af37);
    this.copperMat = enameledCopper(0xb45309);
    this.chromeMat = labMetal(0xf1f5f9, 0.95, 0.12);
    this.darkScreenMat = labMetal(0x020617, 0.2, 0.35);

    // 倒角光学刀口狭缝光阑
    const jawGeo = new THREE.BoxGeometry(0.018, 0.042, 0.032);
    const jawMat = anodizedAluminum(0xe2e8f0, 0.18);
    this.upperJaw = new THREE.Mesh(jawGeo, jawMat);
    this.lowerJaw = new THREE.Mesh(jawGeo, jawMat);

    // 磁分析器极靴 - 开架式环形外框极靴与后置实心 D 形极靴
    const reach = MASS_STAGE.plateReach;
    const nearPoleGeo = new THREE.TorusGeometry(reach + 0.006, 0.008, 16, 48, Math.PI);
    this.nearPole = new THREE.Mesh(nearPoleGeo, this.redMat);

    const dShape = new THREE.Shape();
    dShape.moveTo(0, -(reach + 0.006));
    dShape.absarc(0, 0, reach + 0.006, -Math.PI / 2, Math.PI / 2, false);
    dShape.lineTo(0, -(reach + 0.006));
    const farPoleGeo = new THREE.ExtrudeGeometry(dShape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.001,
      bevelThickness: 0.001,
    });
    this.farPole = new THREE.Mesh(farPoleGeo, this.blueMat);

    // 动态极性宝石徽标
    const badgeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.006, 24);
    this.poleLabelN = new THREE.Mesh(badgeGeo, this.redMat);
    this.poleLabelS = new THREE.Mesh(badgeGeo, this.blueMat);

    this.readout = new ReadoutPanel(0.22, 0.08);

    this.build();
  }

  public sync(state: MassSpecVisual): void {
    this.jawGroup.userData.jawOpening = state.jawOpening;
    const half = 0.003 + state.jawOpening * 0.022;
    this.upperJaw.position.y = MASS_STAGE.entranceY + half + 0.021;
    this.lowerJaw.position.y = MASS_STAGE.entranceY - half - 0.021;

    this.accelKnob.rotation.z = ((state.accelVoltage - 200) / 4800) * Math.PI * 2;
    this.selectorKnob.rotation.z = (state.plateVoltage / 800) * Math.PI * 2;

    const nearIsNorth = state.analyzerBz < 0;
    this.nearPole.material = nearIsNorth ? this.redMat : this.blueMat;
    this.farPole.material = nearIsNorth ? this.blueMat : this.redMat;
    this.poleLabelN.material = nearIsNorth ? this.redMat : this.blueMat;
    this.poleLabelS.material = nearIsNorth ? this.blueMat : this.redMat;

    this.probeGroup.position.x = state.probeX;

    for (let i = 0; i < this.ionMeshes.length; i++) {
      const ion = state.ions[i];
      const mesh = this.ionMeshes[i];
      const halo = this.halos[i];
      const spot = this.spotMeshes[i];
      const mag = this.magMeshes[i];
      const hist = this.trailHist[i];

      if (!ion || !ion.visible) {
        mesh.visible = false;
        halo.visible = false;
        spot.visible = false;
        mag.visible = false;
        hist.length = 0;
        this.trailLines[i].geometry.setDrawRange(0, 0);
        continue;
      }

      mesh.visible = true;
      mesh.position.set(ion.x, ion.y, 0.0);

      halo.visible = true;
      halo.position.set(ion.x, ion.y, 0.005);
      halo.scale.setScalar(0.036 + 0.016 * ion.opacity);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(ion.color);
      mat.emissive.setHex(ion.color);
      mat.opacity = Math.max(0.35, ion.opacity);

      (halo.material as THREE.SpriteMaterial).color.setHex(ion.color);
      (halo.material as THREE.SpriteMaterial).opacity = ion.opacity;

      // 探测器焦平面上的撞击光斑
      spot.visible = ion.spotVisible;
      spot.position.set(MASS_STAGE.entranceX, ion.spotY, 0.0);
      (spot.material as THREE.MeshStandardMaterial).color.setHex(ion.color);
      (spot.material as THREE.MeshStandardMaterial).emissive.setHex(ion.color);

      // 前面板紧凑型谱线峰值指示器（整齐置于控制台台面）
      mag.visible = ion.magVisible;
      mag.position.set(ion.magX, 0.065, 0.115);
      (mag.material as THREE.MeshStandardMaterial).color.setHex(ion.color);
      (mag.material as THREE.MeshStandardMaterial).emissive.setHex(ion.color);

      hist.push([ion.x, ion.y]);
      if (hist.length > 24) hist.shift();

      const attr = this.trails[i];
      hist.forEach((point, index) => attr.setXYZ(index, point[0], point[1], 0.0));
      attr.needsUpdate = true;
      this.trailLines[i].geometry.setDrawRange(0, hist.length);
      (this.trailLines[i].material as THREE.LineBasicMaterial).color.setHex(ion.color);
    }

    if (this.readout.mesh.visible) {
      this.readout.write([
        { text: `${Math.round(state.accelVoltage)} V`, color: '#fbbf24', size: 56 },
        { text: `B ${state.analyzerBz.toFixed(2)} T`, color: '#38bdf8', size: 40 },
        { text: state.jawOpening > 0.92 ? '狭缝全开' : `狭缝 ${(state.jawOpening * 100).toFixed(0)}%`, color: '#e2e8f0', size: 30 },
      ]);
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }

  private build(): void {
    // 1. 圆角流线型精密基座
    this.buildBasePlatform();

    // 2. 刚性结构支撑立柱（牢固接地）
    this.buildSupportPylons();

    // 3. 第一阶段：超高真空电子轰击离子源
    this.buildIonSource();

    // 4. 第二阶段：正交电磁场维恩速度选择器（E x B）
    this.buildVelocitySelector();

    // 5. 第三阶段：测微头驱动精密狭缝准直器
    this.buildCollimatorJaws();

    // 6. 第四阶段：带石英视窗的 D 形半圆形飞行真空室
    this.buildVacuumChamber();

    // 7. 第五阶段：入射狭缝与微通道板（MCP）焦平面探测器
    this.buildDetectorAndSlit();

    // 8. 第六阶段：C 型磁轭分析电磁铁（前方视角无遮挡）
    this.buildAnalyzerMagnet();

    // 9. 一体化前置控制台（平齐安装于机箱）
    this.buildFrontConsoles();

    // 10. 动态轨迹视觉效果、光晕、拖尾与可拖拽探针
    this.buildIonVisuals();

    // 隐藏冗余的 3D 悬浮画布读数
    this.readout.mesh.visible = false;
    this.group.add(this.readout.mesh);
  }

  private buildBasePlatform(): void {
    // 流线型圆角仪器控制台基座
    const w = 0.88;
    const d = 0.28;
    const r = 0.04;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -d / 2);
    shape.lineTo(w / 2 - r, -d / 2);
    shape.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(w / 2, d / 2 - r);
    shape.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-w / 2 + r, d / 2);
    shape.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-w / 2, -d / 2 + r);
    shape.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, (Math.PI * 3) / 2, false);

    const baseGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.020,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 8,
    });
    const plinth = new THREE.Mesh(baseGeo, this.chassisMat);
    plinth.rotation.x = Math.PI / 2;
    plinth.position.set(-0.02, 0.023, 0);

    const rim = outlined(plinth, 0x64748b, 0.4);
    this.group.add(plinth, rim);

    // 四个减震调平底脚
    const footGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.010, 24);
    for (const [x, z] of [
      [-w / 2 + 0.04, -d / 2 + 0.04],
      [-w / 2 + 0.04, d / 2 - 0.04],
      [w / 2 - 0.08, -d / 2 + 0.04],
      [w / 2 - 0.08, d / 2 - 0.04],
    ]) {
      const foot = new THREE.Mesh(footGeo, this.chassisMat);
      foot.position.set(x - 0.02, 0.005, z);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.002, 6, 24), this.goldMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(x - 0.02, 0.010, z);
      this.group.add(foot, collar);
    }

    // 前侧激光蚀刻铭牌标识
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.010, 0.002), this.goldMat);
    badge.position.set(-0.02, 0.015, d / 2 + 0.002);
    this.group.add(badge);
  }

  private buildSupportPylons(): void {
    const pylonSpecs = [
      { x: -0.40, z: 0.0, topY: MASS_STAGE.entranceY - 0.028, r: 0.011 }, // 位于离子源下方
      { x: -0.25, z: 0.0, topY: MASS_STAGE.entranceY - 0.032, r: 0.011 }, // 位于速度选择器下方
      { x: 0.06, z: 0.0, topY: MASS_STAGE.entranceY - 0.025, r: 0.013 },  // 位于狭缝 / 入口下方
      { x: 0.28, z: 0.0, topY: MASS_STAGE.entranceY - 0.035, r: 0.015 },  // 位于磁铁回路磁轭下方
    ];

    for (const spec of pylonSpecs) {
      const height = spec.topY - 0.023;
      const centerY = 0.023 + height / 2;

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(spec.r * 2.0, spec.r * 2.3, 0.012, 24), this.chassisMat);
      collar.position.set(spec.x, 0.023 + 0.006, spec.z);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(spec.r, spec.r, height, 24), this.chromeMat);
      shaft.position.set(spec.x, centerY, spec.z);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(spec.r * 1.6, spec.r * 1.4, 0.008, 24), this.aluminumMat);
      cap.position.set(spec.x, spec.topY - 0.004, spec.z);

      this.group.add(collar, shaft, cap);
    }
  }

  private buildIonSource(): void {
    this.sourceGroup.name = 'IonSource';
    this.sourceGroup.position.set(MASS_STAGE.sourceX, MASS_STAGE.entranceY, 0);

    // 1. 超高真空电离室圆柱筒
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.062, 24), this.aluminumMat);
    chamber.rotation.z = Math.PI / 2;

    for (const x of [-0.02, -0.005, 0.01]) {
      const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.003, 24), this.aluminumMat);
      fin.rotation.z = Math.PI / 2;
      fin.position.x = x;
      this.sourceGroup.add(fin);
    }

    // 2. 光学石英观察视窗
    const window = new THREE.Mesh(new THREE.SphereGeometry(0.020, 24, 18), opticalQuartz(0x38bdf8, 0.35));

    // 3. 白炽钨丝阴极
    const filament = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 8, 20), labGlow(0xf97316, 0.95));
    filament.rotation.y = Math.PI / 2;

    // 4. 陶瓷高压绝缘支柱
    for (const x of [-0.015, 0.015]) {
      const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.026, 16), labMetal(0xf8fafc, 0.1, 0.9));
      insulator.position.set(x, 0.036, 0);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.007, 16), this.goldMat);
      cap.position.set(x, 0.051, 0);
      this.sourceGroup.add(insulator, cap);
    }

    // 5. 加速引出喷嘴
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.024, 20), this.aluminumMat);
    nozzle.rotation.z = -Math.PI / 2;
    nozzle.position.x = 0.040;

    this.sourceGroup.add(chamber, window, filament, nozzle);
    this.group.add(this.sourceGroup);

    const glow = new THREE.PointLight(0x38bdf8, 0.5, 0.3);
    glow.position.copy(this.sourceGroup.position);
    this.group.add(glow);
  }

  private buildVelocitySelector(): void {
    const selectorGroup = new THREE.Group();
    selectorGroup.position.set((MASS_STAGE.selector0 + MASS_STAGE.selector1) / 2, MASS_STAGE.entranceY, 0);

    // 透明石英外罩
    const coverGeo = new THREE.BoxGeometry(0.16, 0.064, 0.052);
    const cover = new THREE.Mesh(coverGeo, opticalQuartz(0x93c5fd, 0.14));
    selectorGroup.add(cover, outlined(cover, 0x60a5fa, 0.35));

    // 平行偏转极板
    const plateGeo = new THREE.BoxGeometry(0.14, 0.005, 0.034);
    const upperPlate = new THREE.Mesh(plateGeo, this.goldMat);
    const lowerPlate = new THREE.Mesh(plateGeo, this.goldMat);
    upperPlate.position.set(0, 0.022, 0);
    lowerPlate.position.set(0, -0.022, 0);

    // 陶瓷绝缘支撑柱
    const ceramicMat = labMetal(0xf8fafc, 0.05, 0.85);
    for (const x of [-0.05, 0.05]) {
      for (const y of [0.022, -0.022]) {
        const standoff = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.015, 12), ceramicMat);
        standoff.position.set(x, y > 0 ? y + 0.0075 : y - 0.0075, 0);
        selectorGroup.add(standoff);
      }
    }

    // 侧向坡莫合金磁极侧板
    const cheekMat = anodizedAluminum(0x475569, 0.3);
    const cheekGeo = new THREE.BoxGeometry(0.13, 0.046, 0.005);
    const poleCheekFront = new THREE.Mesh(cheekGeo, cheekMat);
    poleCheekFront.position.set(0, 0, 0.025);
    const poleCheekBack = new THREE.Mesh(cheekGeo, cheekMat);
    poleCheekBack.position.set(0, 0, -0.025);

    selectorGroup.add(upperPlate, lowerPlate, poleCheekFront, poleCheekBack);
    this.group.add(selectorGroup);
  }

  private buildCollimatorJaws(): void {
    this.jawGroup.name = 'SlitJaws';
    this.jawGroup.position.set(MASS_STAGE.slitX, 0, 0);

    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.13, 16), this.aluminumMat);
    screw.position.set(0, MASS_STAGE.entranceY, 0.020);

    const micrometerDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, 0.022, 24), this.goldMat);
    micrometerDrum.position.set(0, MASS_STAGE.entranceY + 0.072, 0.020);

    this.jawGroup.add(this.upperJaw, this.lowerJaw, screw, micrometerDrum);
    this.group.add(this.jawGroup);
  }

  private buildVacuumChamber(): void {
    const chamberGroup = new THREE.Group();
    const x0 = MASS_STAGE.entranceX;
    const y0 = MASS_STAGE.entranceY;
    const reach = MASS_STAGE.plateReach;

    const dShape = new THREE.Shape();
    dShape.moveTo(x0, y0 - reach);
    dShape.absarc(x0, y0, reach, -Math.PI / 2, Math.PI / 2, false);
    dShape.lineTo(x0, y0 - reach);

    // 后置暗色吸收底板
    const backplateGeo = new THREE.ShapeGeometry(dShape, 48);
    const backplateMat = labMetal(0x020617, 0.4, 0.6);
    const backplate = new THREE.Mesh(backplateGeo, backplateMat);
    backplate.position.set(0, 0, -0.030);
    chamberGroup.add(backplate);

    // 外周壁框架
    const wallCurvePoints: THREE.Vector3[] = [];
    const wallSteps = 48;
    for (let i = 0; i <= wallSteps; i++) {
      const angle = -Math.PI / 2 + (Math.PI * i) / wallSteps;
      wallCurvePoints.push(new THREE.Vector3(x0 + reach * Math.cos(angle), y0 + reach * Math.sin(angle), 0));
    }
    wallCurvePoints.push(new THREE.Vector3(x0, y0 - reach, 0));

    const wallCurve = new THREE.CatmullRomCurve3(wallCurvePoints);
    const wallMesh = new THREE.Mesh(
      new THREE.TubeGeometry(wallCurve, 64, 0.012, 12, true),
      this.aluminumMat,
    );
    chamberGroup.add(wallMesh);

    // 前置石英视窗
    const quartzWindow = new THREE.Mesh(backplateGeo, labGlass(0.14));
    quartzWindow.position.set(0, 0, 0.030);
    chamberGroup.add(quartzWindow);

    const bezelLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(wallCurvePoints),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 }),
    );
    bezelLine.position.set(0, 0, 0.032);
    chamberGroup.add(bezelLine);

    // 参考引导轨道
    this.addGuideArc(0.043, 1, 0x38bdf8, 0.45);  // ¹H⁺ 轨道
    this.addGuideArc(0.086, 1, 0xfacc15, 0.45);  // ⁴He⁺ 轨道
    this.addGuideArc(0.149, 1, 0xf97316, 0.45);  // ¹²C⁺ 轨道
    this.addGuideArc(0.086, -1, 0x64748b, 0.25); // 反向极性预览轨道

    // 高真空抽气法兰接口
    const pumpFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.040, 20), this.chassisMat);
    pumpFlange.position.set(x0 + 0.12, y0 - reach - 0.020, -0.015);
    const bellows = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.003, 8, 20), this.aluminumMat);
    bellows.rotation.x = Math.PI / 2;
    bellows.position.copy(pumpFlange.position);
    chamberGroup.add(pumpFlange, bellows);

    this.group.add(chamberGroup);
  }

  private buildDetectorAndSlit(): void {
    const x0 = MASS_STAGE.entranceX;
    const y0 = MASS_STAGE.entranceY;

    // 狭缝光阑框架
    const apertureCollar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.030), this.aluminumMat);
    apertureCollar.position.set(x0 - 0.004, y0, 0);
    this.group.add(apertureCollar);

    // 上下微通道板（MCP）探测通道条
    const stripHeight = MASS_STAGE.plateReach - 0.015;
    const upperDetector = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, stripHeight, 0.028),
      new THREE.MeshStandardMaterial({ map: plateTexture(), metalness: 0.45, roughness: 0.45 }),
    );
    upperDetector.position.set(x0 - 0.004, y0 + stripHeight / 2 + 0.008, 0);
    upperDetector.name = 'DetectorPlateUpper';

    const lowerDetector = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, stripHeight, 0.028),
      new THREE.MeshStandardMaterial({ map: plateTexture(), metalness: 0.45, roughness: 0.45 }),
    );
    lowerDetector.position.set(x0 - 0.004, y0 - stripHeight / 2 - 0.008, 0);
    lowerDetector.name = 'DetectorPlateLower';

    this.group.add(
      upperDetector,
      lowerDetector,
      outlined(upperDetector, 0x38bdf8, 0.4),
      outlined(lowerDetector, 0x38bdf8, 0.4),
    );
  }

  private buildAnalyzerMagnet(): void {
    this.magnetGroup.name = 'AnalyzerMagnet';
    const x0 = MASS_STAGE.entranceX;
    const y0 = MASS_STAGE.entranceY;
    const reach = MASS_STAGE.plateReach;

    // 后置实心 D 形磁极极靴（衬于真空室背板后侧，提供坚实磁极基板）
    this.farPole.rotation.set(0, 0, 0);
    this.farPole.position.set(x0, y0, -0.046);

    // 前置开架式环形外框极靴（沿 D 形真空室弧形外沿贴合，视野 100% 贯通通透，无任何圆盘遮挡）
    this.nearPole.rotation.z = -Math.PI / 2;
    this.nearPole.position.set(x0, y0, 0.042);

    // 前端直边极靴锁紧端梁（固定于狭缝探测侧基准线）
    const frontCheek = new THREE.Mesh(new THREE.BoxGeometry(0.012, reach * 2 + 0.016, 0.008), this.chassisMat);
    frontCheek.position.set(x0 - 0.006, y0, 0.042);

    // C 型重型磁轭几何定位
    const yokeX = x0 + reach + 0.045;
    const spineHeight = (reach + 0.024) * 2 + 0.032;
    const yokeSpine = new THREE.Mesh(new THREE.BoxGeometry(0.034, spineHeight, 0.11), this.chassisMat);
    yokeSpine.position.set(yokeX, y0, -0.005);

    const armLength = yokeX - x0 + 0.04;
    const armCenterX = x0 + (yokeX - x0) / 2 - 0.01;
    const yokeTop = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.030, 0.11), this.chassisMat);
    yokeTop.position.set(armCenterX, y0 + reach + 0.024, -0.005);

    const yokeBottom = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.030, 0.11), this.chassisMat);
    yokeBottom.position.set(armCenterX, y0 - reach - 0.024, -0.005);

    // 铜质磁场励磁线圈（套绕于上下磁轭横臂上，符合工业电磁铁经典布局）
    const coilGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.10, 24);
    const topCoil = new THREE.Mesh(coilGeo, this.copperMat);
    topCoil.rotation.z = Math.PI / 2;
    topCoil.position.set(armCenterX + 0.02, y0 + reach + 0.024, -0.005);

    const bottomCoil = new THREE.Mesh(coilGeo, this.copperMat);
    bottomCoil.rotation.z = Math.PI / 2;
    bottomCoil.position.set(armCenterX + 0.02, y0 - reach - 0.024, -0.005);

    // 动态极性宝石徽标
    this.poleLabelN.rotation.x = Math.PI / 2;
    this.poleLabelN.position.set(x0 + 0.02, y0 + reach + 0.024, 0.052);

    this.poleLabelS.rotation.x = Math.PI / 2;
    this.poleLabelS.position.set(x0 + 0.02, y0 - reach - 0.024, 0.052);

    this.magnetGroup.add(
      this.nearPole,
      this.farPole,
      frontCheek,
      topCoil,
      bottomCoil,
      yokeSpine,
      yokeTop,
      yokeBottom,
      this.poleLabelN,
      this.poleLabelS,
    );
    this.group.add(this.magnetGroup);
  }

  private buildFrontConsoles(): void {
    // 左侧控制台（与机箱平齐）
    const leftConsoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.042, 0.08), this.chassisMat);
    leftConsoleBox.position.set(-0.25, 0.038, 0.095);
    leftConsoleBox.rotation.x = Math.PI / 8;

    this.buildKnob(this.accelKnob, -0.30, 0.052, 0.105, 0xf59e0b, 'ACCEL');
    this.buildKnob(this.selectorKnob, -0.20, 0.052, 0.105, 0x38bdf8, 'SELECT');
    this.accelKnob.name = 'AccelKnob';
    this.selectorKnob.name = 'SelectorKnob';

    this.group.add(leftConsoleBox, outlined(leftConsoleBox, 0x64748b, 0.35));
    this.group.add(this.accelKnob, this.selectorKnob);

    // 右侧质谱监视器台面
    const rightMonitorBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.042, 0.08), this.chassisMat);
    rightMonitorBox.position.set(0.42, 0.038, 0.095);
    rightMonitorBox.rotation.x = Math.PI / 8;

    const screenMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.030, 0.003), this.darkScreenMat);
    screenMesh.position.set(0.42, 0.048, 0.108);
    screenMesh.rotation.x = Math.PI / 8;

    const baseLine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.0012, 0.002), labGlow(0x38bdf8, 0.4));
    baseLine.position.set(0.42, 0.045, 0.111);
    baseLine.rotation.x = Math.PI / 8;

    this.group.add(rightMonitorBox, outlined(rightMonitorBox, 0x64748b, 0.35), screenMesh, baseLine);
  }

  private buildKnob(group: THREE.Group, x: number, y: number, z: number, color: number, _label: string): void {
    group.position.set(x, y, z);

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.012, 24), labGlow(color, 0.45));
    disc.rotation.x = Math.PI / 3;

    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.021, 0.004, 24), this.chassisMat);
    skirt.rotation.x = Math.PI / 3;
    skirt.position.z = -0.003;

    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.009, 0.0025), labMetal(0xf8fafc, 0.2, 0.4));
    mark.position.set(0.007, 0, 0.005);

    group.add(skirt, disc, mark);
  }

  private buildIonVisuals(): void {
    const disc = softDiscTexture();

    for (let i = 0; i < 4; i++) {
      const ionMat = labGlow(0xffffff, 0.85);
      ionMat.transparent = true;

      const ion = new THREE.Mesh(new THREE.SphereGeometry(0.007, 16, 12), ionMat);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: disc,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 14, 10), ionMat.clone());
      const mag = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), ionMat.clone());

      const trailGeo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(new Float32Array(24 * 3), 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      trailGeo.setAttribute('position', attr);
      trailGeo.setDrawRange(0, 24);

      const trail = new THREE.Line(
        trailGeo,
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.70,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      trail.frustumCulled = false;
      trail.geometry.setDrawRange(0, 0);

      this.group.add(ion, halo, spot, mag, trail);
      this.trailLines.push(trail);
      this.ionMeshes.push(ion);
      this.halos.push(halo);
      this.spotMeshes.push(spot);
      this.magMeshes.push(mag);
      this.trails.push(attr);
    }

    this.probeGroup.name = 'FieldProbe';
    this.probeGroup.position.set(0, MASS_STAGE.entranceY, 0.050);

    const guideRail = new THREE.Mesh(
      new THREE.BoxGeometry(MASS_STAGE.entranceX - MASS_STAGE.sourceX + 0.35, 0.0035, 0.0035),
      this.aluminumMat,
    );
    guideRail.position.set((MASS_STAGE.sourceX + MASS_STAGE.entranceX + 0.35) / 2, MASS_STAGE.entranceY + 0.042, 0.035);
    this.group.add(guideRail);

    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.060, 12), this.aluminumMat);
    wand.rotation.z = Math.PI / 2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.010, 16, 12), labGlow(0x22d3ee, 0.9));
    bead.position.x = 0.032;

    this.probeGroup.add(wand, bead);
    this.group.add(this.probeGroup);

    const beamAxis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0016, 0.0016, MASS_STAGE.entranceX - MASS_STAGE.sourceX, 12),
      labGlow(0x94a3b8, 0.25),
    );
    beamAxis.rotation.z = Math.PI / 2;
    beamAxis.position.set((MASS_STAGE.sourceX + MASS_STAGE.entranceX) / 2, MASS_STAGE.entranceY, 0.0);
    this.group.add(beamAxis);
  }

  private addGuideArc(radius: number, side: 1 | -1, color: number, opacity: number): void {
    const points: THREE.Vector3[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const theta = (Math.PI * i) / steps;
      const pt = trajectoryPoint(radius, theta, side);
      points.push(new THREE.Vector3(MASS_STAGE.entranceX + pt.x, MASS_STAGE.entranceY + pt.y, -0.005));
    }
    const arc = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    arc.frustumCulled = false;
    this.group.add(arc);
  }
}

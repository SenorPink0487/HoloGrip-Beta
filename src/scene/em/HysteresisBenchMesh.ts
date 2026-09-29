import * as THREE from 'three';
import { B_AXIS_TESLA, H_MAX } from '../../physics/em/hysteresis.ts';
import { disposeObjectTree } from './disposeObject.ts';
import {
  anodizedAluminum,
  createJumperLead,
  enameledCopper,
  graticuleTexture,
  labGlow,
  labMetal,
  opticalQuartz,
  outlined,
  polishedGold,
  ReadoutPanel,
} from './labKit.ts';

import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export const SAMPLE_CENTER_Y = 0.34;
export const SAMPLE_HALF = 0.12;
const DOMAIN_COUNT = 12;

export interface HysteresisVisual {
  materialColor: number;
  H: number;
  B: number;
  domainSigns: number[];
  probeAxial: number;
  auto: boolean;
  loop: Array<{ h: number; b: number }>;
  loopKey: string;
}

export interface HysteresisBenchMeshOptions {
  computeBridge?: ComputeBridge;
}

export class HysteresisBenchMesh {
  public readonly group = new THREE.Group();
  public readonly sampleGroup = new THREE.Group();
  public readonly knobGroup = new THREE.Group();
  public readonly sweepSwitch = new THREE.Group();
  public readonly probeGroup = new THREE.Group();
  public computeBridge?: ComputeBridge;
  public readonly cursor = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 16, 12),
    labGlow(0x38bdf8, 0.95),
  );

  private readonly sampleMat: THREE.MeshStandardMaterial;
  private readonly domains: THREE.Mesh[] = [];
  private readonly loopGeo = new THREE.BufferGeometry();
  private readonly loopAttr = new THREE.BufferAttribute(new Float32Array(160 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  private loopKey = '';
  private readonly copperMat: THREE.MeshStandardMaterial;
  private readonly instrumentChassisMat: THREE.MeshStandardMaterial;
  private readonly frontBezelMat: THREE.MeshStandardMaterial;
  private readonly aluminumMat: THREE.MeshStandardMaterial;
  private readonly goldMat: THREE.MeshStandardMaterial;
  private readonly readout: ReadoutPanel;

  constructor(options: HysteresisBenchMeshOptions = {}) {
    this.computeBridge = options.computeBridge;
    this.group.name = 'HysteresisBench';
    this.sampleMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      emissive: 0x1e293b,
      emissiveIntensity: 0.18,
      metalness: 0.82,
      roughness: 0.28,
    });
    this.copperMat = enameledCopper(0xb45309);
    // 专业实验室仪器深空灰与银色质感（非纯黑）
    this.instrumentChassisMat = labMetal(0x475569, 0.55, 0.35);
    this.frontBezelMat = anodizedAluminum(0x94a3b8, 0.25);
    this.aluminumMat = anodizedAluminum(0xcbd5e1, 0.22);
    this.goldMat = polishedGold(0xd4af37);

    this.loopGeo.setAttribute('position', this.loopAttr);
    this.loopGeo.setDrawRange(0, 0);
    this.readout = new ReadoutPanel(0.2, 0.07);

    this.build();
  }

  public sync(state: HysteresisVisual): void {
    this.sampleMat.color.setHex(state.materialColor);
    this.sampleMat.emissive.setHex(state.materialColor);

    for (let i = 0; i < this.domains.length; i++) {
      const sign = state.domainSigns[i] ?? (i < this.domains.length / 2 ? 1 : -1);
      this.domains[i].rotation.x = sign > 0 ? 0 : Math.PI;
      const mat = this.domains[i].material as THREE.MeshStandardMaterial;
      mat.color.setHex(sign > 0 ? 0x86efac : 0x64748b);
      mat.emissive.setHex(sign > 0 ? 0x22c55e : 0x1e293b);
    }

    this.probeGroup.position.y = SAMPLE_CENTER_Y + state.probeAxial;
    this.knobGroup.rotation.z = (state.H / H_MAX) * Math.PI;
    this.sweepSwitch.rotation.z = state.auto ? 0.55 : -0.55;
    this.copperMat.emissiveIntensity = 0.12 + Math.min(0.85, Math.abs(state.H) / H_MAX);

    this.cursor.position.set((state.H / H_MAX) * 0.082, (state.B / B_AXIS_TESLA) * 0.068, 0.016);

    if (state.loopKey !== this.loopKey) {
      this.loopKey = state.loopKey;
      this.writeLoop(state.loop);
    }

    if (this.readout.mesh.visible) {
      this.readout.write([
        { text: `H ${Math.round(state.H)} A/m`, color: '#fbbf24', size: 40 },
        { text: `B ${state.B.toFixed(3)} T`, color: '#86efac', size: 48 },
        { text: state.auto ? '自动循环扫描' : '手动励磁中', color: '#e2e8f0', size: 28 },
      ]);
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }

  private build(): void {
    // 1. 重型励磁螺线管与磁导计组件（居中）
    this.buildSolenoidAssembly();

    // 2. 可更换金相试样与全息磁畴观察窗
    this.buildSampleAssembly();

    // 3. 轴向磁场探测线圈探针
    this.buildProbe();

    // 4. 数字存储式 B-H 分析示波器（右侧）
    this.buildScope();

    // 5. 带有滚花旋钮与摇臂开关的励磁控制台（左侧）
    this.buildConsole();

    // 6. 屏蔽式 BNC 同轴信号线
    this.buildCables();

    // 隐藏冗余的 3D 悬浮画布读数（已在 VisionOS 卡片中清晰呈现）
    this.readout.mesh.visible = false;
    this.group.add(this.readout.mesh);
  }

  private buildSolenoidAssembly(): void {
    const solenoidGroup = new THREE.Group();
    solenoidGroup.position.set(0, SAMPLE_CENTER_Y, 0);

    // 直接置于台面的圆形拉丝铝质底座
    const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.02, 32), this.instrumentChassisMat);
    standBase.position.y = -SAMPLE_CENTER_Y + 0.01;
    const rimTrim = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.003, 8, 32), this.goldMat);
    rimTrim.rotation.x = Math.PI / 2;
    rimTrim.position.y = -SAMPLE_CENTER_Y + 0.02;
    solenoidGroup.add(standBase, rimTrim, outlined(standBase, 0x64748b, 0.3));

    // 两根立式支撑立柱
    for (const x of [-0.05, 0.05]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.23, 16), this.aluminumMat);
      pillar.position.set(x, -0.115, 0);
      solenoidGroup.add(pillar);
    }

    // 机加工阳极氧化铝端面法兰
    for (const y of [-0.095, 0.095]) {
      const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.012, 32), this.frontBezelMat);
      cheek.rotation.x = -Math.PI / 2;
      cheek.position.y = y;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.0035, 8, 32), this.goldMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = y;
      solenoidGroup.add(cheek, rim);
    }

    // 用于插入测试试样的中心透明石英套管
    const quartzSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.22, 32, 1, true),
      opticalQuartz(0x8ec5fc, 0.12),
    );
    quartzSleeve.renderOrder = 2;
    solenoidGroup.add(quartzSleeve);

    // 初级励磁绕组（16 匝高纯度铜线）
    const ringGeo = new THREE.TorusGeometry(0.055, 0.0036, 10, 32);
    for (let i = 0; i < 16; i++) {
      const ring = new THREE.Mesh(ringGeo, this.copperMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = (i - 7.5) * 0.0082;
      solenoidGroup.add(ring);
    }

    // 嵌入式次级探测线圈（居中的金色拾取线圈）
    const searchGeo = new THREE.TorusGeometry(0.036, 0.0035, 8, 24);
    const search1 = new THREE.Mesh(searchGeo, labGlow(0xfbbf24, 0.6));
    search1.rotation.x = -Math.PI / 2;
    search1.position.y = -0.006;
    const search2 = search1.clone();
    search2.position.y = 0.006;
    solenoidGroup.add(search1, search2);

    // 前侧带有镀金接线柱的接线盒
    const junction = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.022), this.instrumentChassisMat);
    junction.position.set(0, -0.075, 0.065);
    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.014, 12), this.goldMat);
      post.position.set(-0.026 + i * 0.026, -0.065, 0.065);
      solenoidGroup.add(post);
    }
    solenoidGroup.add(junction);

    this.group.add(solenoidGroup);
  }

  private buildSampleAssembly(): void {
    this.sampleGroup.name = 'FerroSample';
    this.sampleGroup.position.set(0, SAMPLE_CENTER_Y, 0);

    // 中心圆柱形测试试样棒（高度 0.24，半径 0.015）
    // Box3 的 Y 轴范围（0.24）严格大于 X 轴范围（0.03）
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, SAMPLE_HALF * 2, 32),
      this.sampleMat,
    );

    // 试样顶部滚花提取旋钮
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.014, 24), this.aluminumMat);
    topCap.position.y = SAMPLE_HALF + 0.007;
    const knurl = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.016, 16), this.goldMat);
    knurl.position.y = SAMPLE_HALF + 0.02;

    this.sampleGroup.add(rod, topCap, knurl);

    // 全息磁畴微观观察视窗
    const chamberGeo = new THREE.BoxGeometry(0.022, 0.18, 0.016);
    const chamberMesh = new THREE.Mesh(chamberGeo, opticalQuartz(0x8ec5fc, 0.12));
    chamberMesh.position.set(0, 0, 0.022);
    chamberMesh.renderOrder = 3;

    const frameLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(chamberGeo),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 }),
    );
    frameLines.position.copy(chamberMesh.position);

    this.sampleGroup.add(chamberMesh, frameLines);

    // 12 个微观磁畴磁偶极子网格
    const coneGeo = new THREE.ConeGeometry(0.0048, 0.014, 12);
    coneGeo.translate(0, 0.002, 0);

    for (let i = 0; i < DOMAIN_COUNT; i++) {
      const domainMat = labGlow(0x86efac, 0.55);
      const dipole = new THREE.Mesh(coneGeo, domainMat);

      const y = -0.074 + (i * 0.148) / (DOMAIN_COUNT - 1);
      dipole.position.set(0, y, 0.022);

      this.sampleGroup.add(dipole);
      this.domains.push(dipole);
    }

    this.group.add(this.sampleGroup);
  }

  private buildProbe(): void {
    this.probeGroup.name = 'FieldProbe';
    this.probeGroup.position.set(0, SAMPLE_CENTER_Y, 0);

    const probeRing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0035, 8, 24), labGlow(0x22d3ee, 0.75));
    probeRing.rotation.x = -Math.PI / 2;

    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.009, 0.065), this.aluminumMat);
    stem.position.z = 0.042;

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.022, 0.024), labMetal(0x0f172a, 0.6, 0.4));
    grip.position.set(0, 0, 0.08);

    this.probeGroup.add(probeRing, stem, grip);
    this.group.add(this.probeGroup);
  }

  private buildScope(): void {
    const scope = new THREE.Group();
    scope.position.set(0.28, 0.12, 0.02);

    // 台式数字示波器外壳（优雅的深空灰/银色，非纯黑）
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.20, 0.12), this.instrumentChassisMat);
    housing.position.z = -0.03;
    housing.rotation.x = -Math.PI / 10; // 朝向用户的人体工学 18 度倾角
    scope.add(housing, outlined(housing, 0x94a3b8, 0.35));

    // 银色显示屏边框
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.012), this.frontBezelMat);
    bezel.rotation.x = -Math.PI / 10;
    bezel.position.set(0, 0.008, 0.035);

    // 采用坐标标尺纹理（graticuleTexture）的高分辨率荧光 CRT 屏幕
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.14),
      new THREE.MeshBasicMaterial({ map: graticuleTexture(), toneMapped: false }),
    );
    screen.rotation.x = -Math.PI / 10;
    screen.position.set(0, 0.014, 0.042);

    // 防眩光保护石英玻璃
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.185, 0.145),
      opticalQuartz(0x86efac, 0.06),
    );
    glass.rotation.x = -Math.PI / 10;
    glass.position.set(0, 0.016, 0.045);

    // 动态荧光 B-H 磁滞回线
    const loop = new THREE.Line(
      this.loopGeo,
      new THREE.LineBasicMaterial({
        color: 0xf0abfc,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      }),
    );
    loop.rotation.x = -Math.PI / 10;
    loop.position.set(0, 0.014, 0.043);
    loop.frustumCulled = false;

    // CRT 屏幕上的工作点光标
    this.cursor.position.set(0, 0, 0.015);
    const cursorHolder = new THREE.Group();
    cursorHolder.rotation.x = -Math.PI / 10;
    cursorHolder.position.set(0, 0.014, 0.043);
    cursorHolder.add(this.cursor);

    // 下边框上的双路 BNC 输入插孔（CH1 励磁驱动 H，CH2 感应测量 B）
    for (const x of [-0.055, 0.055]) {
      const bnc = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0075, 0.012, 16), this.goldMat);
      bnc.rotation.x = Math.PI / 2 - Math.PI / 10;
      bnc.position.set(x, -0.065, 0.042);
      scope.add(bnc);
    }

    scope.add(bezel, screen, glass, loop, cursorHolder);
    this.group.add(scope);
  }

  private buildConsole(): void {
    const supplyGroup = new THREE.Group();
    supplyGroup.position.set(-0.25, 0.08, 0.04);

    // 电源控制台外壳（银灰配色）
    const consoleBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.12), this.instrumentChassisMat);
    consoleBody.rotation.x = -Math.PI / 10;
    supplyGroup.add(consoleBody, outlined(consoleBody, 0x94a3b8, 0.35));

    const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.125, 0.008), this.frontBezelMat);
    frontPanel.rotation.x = -Math.PI / 10;
    frontPanel.position.set(0, 0.008, 0.062);
    supplyGroup.add(frontPanel);

    this.group.add(supplyGroup);

    // 连续励磁磁场调节旋钮
    this.knobGroup.name = 'FieldKnob';
    this.knobGroup.position.set(-0.28, 0.07, 0.11);

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.018, 24), labGlow(0xf59e0b, 0.45));
    disc.rotation.x = Math.PI / 2 - Math.PI / 10;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.003, 8, 24), this.goldMat);
    ring.rotation.x = Math.PI / 2 - Math.PI / 10;
    const pointerMark = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.003), labMetal(0xf8fafc, 0.1, 0.2));
    pointerMark.position.set(0, 0.011, 0.01);
    this.knobGroup.add(disc, ring, pointerMark);
    this.group.add(this.knobGroup);

    // 自动扫描双态拨动开关
    this.sweepSwitch.name = 'SweepSwitch';
    this.sweepSwitch.position.set(-0.20, 0.08, 0.11);

    const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.016, 0.018), this.aluminumMat);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.038, 0.006), labGlow(0x34d399, 0.65));
    lever.position.y = 0.016;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 10), labMetal(0xf8fafc, 0.3, 0.4));
    tip.position.y = 0.036;
    this.sweepSwitch.add(cradle, lever, tip);
    this.group.add(this.sweepSwitch);
  }

  private buildCables(): void {
    // 连接螺线管端子与示波器 BNC 输入端口的双柔性 BNC 同轴信号线
    const cableH = createJumperLead([
      new THREE.Vector3(0.026, SAMPLE_CENTER_Y - 0.07, 0.065),
      new THREE.Vector3(0.10, 0.12, 0.08),
      new THREE.Vector3(0.18, 0.10, 0.06),
      new THREE.Vector3(0.225, 0.055, 0.05),
    ], 0x38bdf8);

    const cableB = createJumperLead([
      new THREE.Vector3(-0.026, SAMPLE_CENTER_Y - 0.07, 0.065),
      new THREE.Vector3(0.06, 0.09, 0.09),
      new THREE.Vector3(0.20, 0.07, 0.07),
      new THREE.Vector3(0.335, 0.055, 0.05),
    ], 0x86efac);

    this.group.add(cableH, cableB);
  }

  private writeLoop(points: Array<{ h: number; b: number }>): void {
    const count = Math.min(points.length, this.loopAttr.count);
    for (let i = 0; i < count; i++) {
      this.loopAttr.setXYZ(i, (points[i].h / H_MAX) * 0.082, (points[i].b / B_AXIS_TESLA) * 0.068, 0.014);
    }
    this.loopGeo.setDrawRange(0, count);
    this.loopAttr.needsUpdate = true;
  }
}

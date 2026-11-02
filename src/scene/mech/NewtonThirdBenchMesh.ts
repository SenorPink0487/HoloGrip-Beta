/**
 * 3D 牛顿第三定律高保真实验台与测力计对拉装置 (Newton's Third Law Precision Laboratory Setup)
 * (Optical-Grade Precision Mechanical Setup)
 *
 * 【工业级精雕建模与光学级实验规范】：
 * 1. 结构完整真实：
 *    - 底部配备科研级双导轨测力实验台 (航天喷砂阳极氧化银铝基座、CNC 四边大倒角、双液态铬精密滑轨、左侧固定锚柱、右侧低摩擦滑块与精密滚花拉手)；
 *    - 导轨床身前倾斜面配备 0~80cm 激光蚀刻毫米精密刻度标尺，游标指针精准读取位移；
 *    - 左侧配备高品质不锈钢铁架台 (双层倒角配重底座、垂直立柱、精密十字夹头与悬挂横梁)，稳稳托载独立测力计，杜绝空虚悬浮；
 * 2. 物理效果真实合理：
 *    - 两只互拉测力计 (A 表与 B 表) 挂钩真实互扣相勾，外侧提环分别锚定在左端柱与右端滑块；
 *    - 拉动右端时，两测力计挂钩紧密咬合在中心，随拉力平稳右移 \Delta x，B 表外壳与滑块右移 2*\Delta x；
 *    - 两螺旋弹簧严格同步伸长，两表游标精准指示完全相同的力示数 (F_A ≡ F_B)；
 * 3. 作用力与反作用力矢量指示：
 *    - 在挂钩咬合点实时呈现一对共线反向、大小严格相等的 3D 物理力矢量箭羽 (\vec{F}_{A \to B} 与 \vec{F}_{B \to A})；
 * 4. 实验台前置深海蓝黑数字仪表屏：
 *    - 正对操作者视线 (+Z)，高对比度清晰呈现 F_A、F_B、\Delta F 与牛顿第三定律矢量恒等式；
 * 5. 严格遵守零 DOM 弹窗/浮动向导原则，视界纯净，纯三维物理交互。
 */

import * as THREE from 'three';
import { SpringDynamometerMesh } from './SpringDynamometerMesh.ts';
import {
  createChamferedBlockGeometry,
  createChamferedHexNut,
  createChampagneBrassMaterial,
  createGuideShaftGeometry,
  createKnurledBand,
  createLevelingPadMaterial,
  createLiquidChromeMaterial,
  createPrecisionRulerTexture,
  createSatinSilverMaterial,
  createTitaniumSlateMaterial,
  disposeObjectTree,
  mechMetal,
  safeCanvas,
} from './mechKit.ts';
import type { TelemetryPoint } from '../../physics/mech/newtonThirdDynamics.ts';

export interface BenchButtonDef {
  id: string;
  label: string;
  mesh: THREE.Mesh;
  baseMesh: THREE.Mesh;
  localPos: THREE.Vector3;
  targetForce?: number;
  action?: 'oscillation' | 'reset' | 'preset';
}

interface SpatialForceReadout {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  prefix: string;
  textColor: string;
  lastText: string;
}

export class NewtonThirdBenchMesh {
  public readonly group = new THREE.Group();

  // 1. 三只高对比度弹簧测力计
  public readonly soloDynamometer: SpringDynamometerMesh;  // 独立测力计 (孔雀青绿，挂于铁架台上)
  public readonly dynamometerA: SpringDynamometerMesh;     // 互拉测力计 A (深海湛蓝，锚定居左)
  public readonly dynamometerB: SpringDynamometerMesh;     // 互拉测力计 B (珊瑚绯红，活动居右)

  // 2. 原生三维浮空力值示数
  private readonly labelSolo: SpatialForceReadout;
  private readonly labelA: SpatialForceReadout;
  private readonly labelB: SpatialForceReadout;

  // 3. 水平导轨实验台构件
  public readonly benchGroup = new THREE.Group();
  public readonly sliderBGroup = new THREE.Group();        // B 表随动滑块托架与拉手
  public readonly pullHandleMesh: THREE.Mesh;             // 右端精密滚花拉手
  private readonly leftAnchorGroup = new THREE.Group();    // 左侧固定锚柱
  private benchScaleTexture!: THREE.CanvasTexture;

  // 4. 铁架台与悬挂构件 (左侧独立测力计支架)
  public readonly standGroup = new THREE.Group();
  public readonly weightGroup = new THREE.Group();         // 独立测力计挂载的砝码组
  public readonly weightMeshes: THREE.Mesh[] = [];

  // 5. 作用力与反作用力 3D 矢量箭羽 (挂钩互扣处的物理力指示)
  private readonly vectorGroup = new THREE.Group();
  private vectorArrowA!: THREE.ArrowHelper;              // F_{B->A} 测力计 B 对 A 的拉力 (指向右)
  private vectorArrowB!: THREE.ArrowHelper;              // F_{A->B} 测力计 A 对 B 的拉力 (指向左)
  private vectorLabelSprite!: THREE.Sprite;
  private vectorLabelTexture!: THREE.CanvasTexture;

  // 6. 前置深海蓝黑遥测仪表盘
  private dashboardMesh!: THREE.Mesh;
  private dashboardTexture!: THREE.CanvasTexture;
  private dashboardCanvas!: HTMLCanvasElement;
  private dashboardCtx!: CanvasRenderingContext2D;
  private lastDashboardText = '';

  // 兼容接口
  public readonly benchButtons: BenchButtonDef[] = [];

  // 物理与几何布局常量
  public readonly hoverHeightY = 0.22;
  private readonly soloBaseX = -0.38;
  private readonly pairAnchorBaseX = -0.16;
  private readonly pairRightBaseX = 0.16;

  // 共享通用工程材质
  private chromeMat!: THREE.MeshStandardMaterial;
  private brassMat!: THREE.MeshStandardMaterial;
  private aluminumMat!: THREE.MeshStandardMaterial;
  private titaniumSlateMat!: THREE.MeshStandardMaterial;
  private footPadMat!: THREE.MeshStandardMaterial;

  constructor() {
    this.group.name = 'NewtonThirdBenchMesh';

    this.initSharedMaterials();

    // 1. 实例化三只弹簧测力计
    this.soloDynamometer = new SpringDynamometerMesh({
      label: 'SoloDynamometer',
      casingColor: 0x0d8275, // 孔雀青绿
      orientation: 'vertical',
    });

    this.dynamometerA = new SpringDynamometerMesh({
      label: 'DynamometerA',
      casingColor: 0x0284c7, // 湛蓝海青 (物体 A)
      scaleSubLabel: 'A',
      orientation: 'horizontal_pair',
      pairRole: 'A',
    });

    this.dynamometerB = new SpringDynamometerMesh({
      label: 'DynamometerB',
      casingColor: 0xe11d48, // 珊瑚绯红 (物体 B)
      scaleSubLabel: 'B',
      orientation: 'horizontal_pair',
      pairRole: 'B',
    });

    // 2. 空间定位布局
    this.soloDynamometer.group.position.set(this.soloBaseX, this.hoverHeightY, 0.0);
    this.soloDynamometer.group.rotation.set(0, 0, 0);
    this.group.add(this.soloDynamometer.group);

    this.dynamometerA.group.position.set(this.pairAnchorBaseX, this.hoverHeightY, 0.0);
    this.dynamometerA.group.rotation.set(0, 0, -Math.PI / 2);
    this.group.add(this.dynamometerA.group);

    this.dynamometerB.group.position.set(this.pairRightBaseX, this.hoverHeightY, 0.0025);
    this.dynamometerB.group.rotation.set(0, 0, Math.PI / 2);
    this.group.add(this.dynamometerB.group);

    // 3. 构建高品质铁架台支撑装置 (托载左侧独立测力计)
    this.createRetortStand();

    // 4. 构建科研级水平导轨实验台与右侧随动拉手滑块
    this.pullHandleMesh = this.createHorizontalRailBench();

    // 5. 构建挂钩处的 3D 作用力与反作用力矢量指示
    this.createActionReactionVectors();

    // 6. 构建正对操作者视线 (+Z) 的前置深海蓝黑遥测仪表盘
    this.createDashboard();

    // 7. 构建无卡片纯净空间力示数 Sprite
    this.labelSolo = this.createForceReadout('F', '#10b981');
    this.labelSolo.sprite.position.set(this.soloBaseX + 0.065, this.hoverHeightY + 0.06, 0.01);
    this.group.add(this.labelSolo.sprite);

    this.labelA = this.createForceReadout('F_A', '#38bdf8');
    this.labelA.sprite.position.set(this.pairAnchorBaseX, this.hoverHeightY + 0.075, 0.01);
    this.group.add(this.labelA.sprite);

    this.labelB = this.createForceReadout('F_B', '#fb7185');
    this.labelB.sprite.position.set(this.pairRightBaseX, this.hoverHeightY + 0.075, 0.01);
    this.group.add(this.labelB.sprite);

    this.updateForceReadout(this.labelSolo, 0);
    this.updateForceReadout(this.labelA, 0);
    this.updateForceReadout(this.labelB, 0);
  }

  /**
   * 初始化通用工程与物理材质 (光学级规范：阳极氧化缎面银铝、镜面液态铬、香槟金黄铜、钛晶灰蓝)
   */
  private initSharedMaterials(): void {
    this.chromeMat = createLiquidChromeMaterial(0xffffff, 0.98, 0.08);
    this.brassMat = createChampagneBrassMaterial(0xf59e0b, 0.90, 0.20);
    this.aluminumMat = createSatinSilverMaterial(0xf1f5f9, 0.74, 0.22);
    this.titaniumSlateMat = createTitaniumSlateMaterial(0x334155, 0.82, 0.26);
    this.footPadMat = createLevelingPadMaterial(0x0f172a, 0.85);
  }

  /**
   * 构建高品质物理实验室铁架台 (支撑独立测力计)
   */
  private createRetortStand(): void {
    this.standGroup.position.set(this.soloBaseX - 0.09, 0, 0);
    this.group.add(this.standGroup);

    // 1. 钛晶深灰与缎面银铝双层倒角重底座
    const lowerBaseGeo = createChamferedBlockGeometry(0.19, 0.012, 0.15, 0.002);
    const lowerBase = new THREE.Mesh(lowerBaseGeo, this.titaniumSlateMat);
    lowerBase.position.set(0, 0.006, 0);
    lowerBase.castShadow = true;
    lowerBase.receiveShadow = true;
    this.standGroup.add(lowerBase);

    const upperDeckGeo = createChamferedBlockGeometry(0.17, 0.006, 0.13, 0.0015);
    const upperDeck = new THREE.Mesh(upperDeckGeo, this.aluminumMat);
    upperDeck.position.set(0, 0.015, 0);
    this.standGroup.add(upperDeck);

    // 四角香槟金滚花调平脚垫
    const footOffsets = [
      [-0.075, -0.055],
      [-0.075, 0.055],
      [0.075, -0.055],
      [0.075, 0.055],
    ];
    for (const [fx, fz] of footOffsets) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.003, 16), this.footPadMat);
      pad.position.set(fx, 0.0015, fz);
      this.standGroup.add(pad);

      const knob = new THREE.Mesh(createKnurledBand(0.009, 0.004), this.brassMat);
      knob.position.set(fx, 0.005, fz);
      this.standGroup.add(knob);
    }

    // 2. 垂直立柱与螺纹法兰凸台
    const flangeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.015, 0.012, 24),
      this.aluminumMat
    );
    flangeMesh.position.set(0, 0.024, 0);
    this.standGroup.add(flangeMesh);

    const lockNut = new THREE.Mesh(createChamferedHexNut(0.009, 0.004), this.brassMat);
    lockNut.position.set(0, 0.030, 0);
    this.standGroup.add(lockNut);

    const poleHeight = 0.46;
    const poleRadius = 0.006;
    const poleMesh = new THREE.Mesh(
      createGuideShaftGeometry(poleHeight, poleRadius),
      this.chromeMat
    );
    poleMesh.position.set(0, poleHeight * 0.5 + 0.030, 0);
    this.standGroup.add(poleMesh);

    // 立柱顶部安全端盖 (车削铝制与香槟金倒角球冠)
    const capGroup = new THREE.Group();
    capGroup.position.set(0, poleHeight + 0.030, 0);
    const capRing = new THREE.Mesh(createKnurledBand(0.008, 0.003), this.brassMat);
    capRing.position.y = 0.0015;
    capGroup.add(capRing);
    const poleCap = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 16, 16), this.chromeMat);
    poleCap.position.set(0, 0.007, 0);
    capGroup.add(poleCap);
    this.standGroup.add(capGroup);

    // 3. 十字夹套 (Bosshead clamp) 与精密香槟金滚花紧固旋钮
    const clampHeightY = this.hoverHeightY + 0.145; // 刚好对齐独立测力计顶部提环
    const clampMesh = new THREE.Mesh(
      createChamferedBlockGeometry(0.026, 0.032, 0.026, 0.0018),
      this.titaniumSlateMat
    );
    clampMesh.position.set(0, clampHeightY, 0);
    this.standGroup.add(clampMesh);

    const knobMesh = new THREE.Mesh(
      createKnurledBand(0.0085, 0.007),
      this.brassMat
    );
    knobMesh.rotation.z = Math.PI / 2;
    knobMesh.position.set(-0.016, clampHeightY, 0);
    this.standGroup.add(knobMesh);

    // 4. 水平横向悬挂臂 (伸向测力计提环正上方)
    const armLen = 0.11;
    const armMesh = new THREE.Mesh(
      createGuideShaftGeometry(armLen, 0.0045),
      this.chromeMat
    );
    armMesh.rotation.z = -Math.PI / 2;
    armMesh.position.set(armLen * 0.5, clampHeightY, 0);
    this.standGroup.add(armMesh);

    // 悬挂吊钩 (勾住测力计顶部 U 提环)
    const hookPath = new THREE.CurvePath<THREE.Vector3>();
    hookPath.add(new THREE.LineCurve3(
      new THREE.Vector3(armLen, clampHeightY, 0),
      new THREE.Vector3(armLen, clampHeightY - 0.014, 0)
    ));
    const hookArc = new THREE.EllipseCurve(
      armLen, clampHeightY - 0.020,
      0.006, 0.006,
      Math.PI * 0.5, Math.PI * 1.8,
      false, 0
    );
    const arcPts = hookArc.getPoints(16);
    for (let i = 0; i < arcPts.length - 1; i++) {
      hookPath.add(new THREE.LineCurve3(
        new THREE.Vector3(arcPts[i].x, arcPts[i].y, 0),
        new THREE.Vector3(arcPts[i + 1].x, arcPts[i + 1].y, 0)
      ));
    }
    const standHook = new THREE.Mesh(
      new THREE.TubeGeometry(hookPath, 24, 0.0016, 12, false),
      this.chromeMat
    );
    this.standGroup.add(standHook);

    // 5. 挂钩码托盘与标准钩码 (初始挂载在秤钩下方，通过参数动态展示)
    this.group.add(this.weightGroup);
    this.createWeightMeshes();
  }

  /**
   * 构建独立测力计下方的精密标准钩码
   */
  private createWeightMeshes(): void {
    const trayGroup = new THREE.Group();
    trayGroup.name = 'weight-tray';

    const stemGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 0.040, 16);
    const stemMesh = new THREE.Mesh(stemGeo, this.chromeMat);
    stemMesh.position.y = -0.020;
    trayGroup.add(stemMesh);

    // 顶部小挂环 (挂于秤钩内)
    const ringGeo = new THREE.TorusGeometry(0.0045, 0.0012, 12, 24);
    const ringMesh = new THREE.Mesh(ringGeo, this.chromeMat);
    ringMesh.rotation.x = Math.PI / 2;
    trayGroup.add(ringMesh);

    // 底部圆托盘 (香槟黄铜车削微凹盘)
    const panGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.004, 32);
    const panMesh = new THREE.Mesh(panGeo, this.brassMat);
    panMesh.position.y = -0.042;
    trayGroup.add(panMesh);

    // 标准 100g 镀铬开槽精密砝码 1 (带外缘倒角与径向避空缺口，对应 ~1N 重力)
    const discGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.008, 32);
    const weight1 = new THREE.Mesh(discGeo, this.chromeMat);
    weight1.position.y = -0.036;
    weight1.name = 'weight-disc-1';
    weight1.visible = false;
    trayGroup.add(weight1);
    this.weightMeshes.push(weight1);

    // 标准 100g 镀铬开槽精密砝码 2 (对应累计 ~2N 重力)
    const weight2 = new THREE.Mesh(discGeo, this.chromeMat);
    weight2.position.y = -0.027;
    weight2.name = 'weight-disc-2';
    weight2.visible = false;
    trayGroup.add(weight2);
    this.weightMeshes.push(weight2);

    this.weightGroup.add(trayGroup);
    this.updateWeightPosition(0);
  }

  /**
   * 同步钩码随独立测力计拉伸伸长的空间位置
   */
  public updateWeightPosition(dispM: number): void {
    const hookY = this.hoverHeightY - 0.165 - dispM;
    this.weightGroup.position.set(this.soloBaseX, hookY, 0);
  }

  /**
   * 设置独立测力计挂载的钩码显示 (0, 1N, 2N)
   */
  public setWeightDisplay(kg: number): void {
    if (this.weightMeshes.length < 2) return;
    if (kg <= 0) {
      this.weightMeshes[0].visible = false;
      this.weightMeshes[1].visible = false;
      this.weightGroup.visible = false;
    } else if (kg < 0.15) {
      this.weightMeshes[0].visible = true;
      this.weightMeshes[1].visible = false;
      this.weightGroup.visible = true;
    } else {
      this.weightMeshes[0].visible = true;
      this.weightMeshes[1].visible = true;
      this.weightGroup.visible = true;
    }
  }

  /**
   * 构建科研级双导轨测力实验台 (水平基座、滑杆、锚柱、滑块与拉手)
   */
  private createHorizontalRailBench(): THREE.Mesh {
    this.group.add(this.benchGroup);

    // 1. 航空喷砂阳极氧化银铝基座床身 (CNC 四边倒角 + 沉槽避空)
    const benchLen = 0.88;
    const benchWidth = 0.13;
    const benchHeight = 0.022;
    const benchY = this.hoverHeightY - 0.055;

    const bedGeo = createChamferedBlockGeometry(benchLen, benchHeight, benchWidth, 0.0022);
    const bedMesh = new THREE.Mesh(bedGeo, this.aluminumMat);
    bedMesh.position.set(0.04, benchY, 0);
    bedMesh.castShadow = true;
    bedMesh.receiveShadow = true;
    this.benchGroup.add(bedMesh);

    // 中央导向深槽与香槟金定位嵌条
    const centerSlotGeo = new THREE.BoxGeometry(benchLen * 0.96, 0.002, 0.024);
    const centerSlot = new THREE.Mesh(centerSlotGeo, this.titaniumSlateMat);
    centerSlot.position.set(0.04, benchY + benchHeight * 0.5 - 0.001, 0);
    this.benchGroup.add(centerSlot);

    // 床身四角减震防滑橡胶垫与香槟金滚花调平脚
    const footOffsets = [
      [-benchLen * 0.46 + 0.04, -benchWidth * 0.42],
      [-benchLen * 0.46 + 0.04, benchWidth * 0.42],
      [benchLen * 0.46 + 0.04, -benchWidth * 0.42],
      [benchLen * 0.46 + 0.04, benchWidth * 0.42],
    ];
    for (const [bx, bz] of footOffsets) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.010, 0.004, 16), this.footPadMat);
      foot.position.set(bx, benchY - benchHeight * 0.5 - 0.003, bz);
      this.benchGroup.add(foot);

      const knob = new THREE.Mesh(createKnurledBand(0.011, 0.005), this.brassMat);
      knob.position.set(bx, benchY - benchHeight * 0.5 + 0.001, bz);
      this.benchGroup.add(knob);
    }

    // 2. 双路液态铬不锈钢精密滑杆
    const rodLen = benchLen * 0.94;
    const rodRadius = 0.0035;
    const rodZOffset = 0.034;
    const railY = benchY + benchHeight * 0.5 + 0.014;

    for (const zSign of [-1, 1]) {
      const railGeo = createGuideShaftGeometry(rodLen, rodRadius);
      const railMesh = new THREE.Mesh(railGeo, this.chromeMat);
      railMesh.rotation.z = Math.PI / 2;
      railMesh.position.set(0.04, railY, zSign * rodZOffset);
      this.benchGroup.add(railMesh);

      // 导轨两端固定安装枕块 (CNC 倒角块 + 镀铬螺栓)
      for (const xSign of [-1, 1]) {
        const pillowGeo = createChamferedBlockGeometry(0.024, 0.020, 0.016, 0.0015);
        const pillowBlock = new THREE.Mesh(pillowGeo, this.titaniumSlateMat);
        pillowBlock.position.set(0.04 + xSign * (rodLen * 0.5 - 0.012), railY - 0.004, zSign * rodZOffset);
        this.benchGroup.add(pillowBlock);

        const bolt = new THREE.Mesh(createChamferedHexNut(0.003, 0.002), this.chromeMat);
        bolt.position.set(0.04 + xSign * (rodLen * 0.5 - 0.012), railY + 0.007, zSign * rodZOffset);
        this.benchGroup.add(bolt);
      }
    }

    // 3. 左侧测力计 A 固定锚柱 (锁定测力计 A 的左侧提环)
    const anchorX = this.pairAnchorBaseX - 0.160;
    this.leftAnchorGroup.position.set(anchorX, railY, 0);

    const anchorPillarGeo = createChamferedBlockGeometry(0.030, 0.048, 0.056, 0.002);
    const anchorPillar = new THREE.Mesh(anchorPillarGeo, this.titaniumSlateMat);
    anchorPillar.position.set(0, 0.014, 0);
    this.leftAnchorGroup.add(anchorPillar);

    // 紧固香槟金滚花手轮
    const thumbKnob = new THREE.Mesh(createKnurledBand(0.012, 0.014), this.brassMat);
    thumbKnob.position.set(0, 0.044, 0);
    this.leftAnchorGroup.add(thumbKnob);

    // 穿过测力计 A 提环的固定不锈钢插销
    const anchorPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.048, 20),
      this.chromeMat
    );
    anchorPin.position.set(0, 0.020, 0);
    this.leftAnchorGroup.add(anchorPin);

    // 测力计 A 静态承托鞍座
    const saddleAGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.050, 24, 1, false, 0, Math.PI);
    const saddleAMesh = new THREE.Mesh(saddleAGeo, this.aluminumMat);
    saddleAMesh.rotation.z = Math.PI / 2;
    saddleAMesh.rotation.x = Math.PI;
    saddleAMesh.position.set(this.pairAnchorBaseX, railY + 0.006, 0);
    this.benchGroup.add(saddleAMesh);

    this.benchGroup.add(this.leftAnchorGroup);

    // 4. 右侧测力计 B 低摩擦随动滑块托架与操作拉手
    this.benchGroup.add(this.sliderBGroup);
    this.sliderBGroup.position.set(this.pairRightBaseX, railY, 0);

    // B 表承托鞍座
    const saddleBMesh = new THREE.Mesh(saddleAGeo, this.aluminumMat);
    saddleBMesh.rotation.z = Math.PI / 2;
    saddleBMesh.rotation.x = Math.PI;
    saddleBMesh.position.set(0, 0.006, 0);
    this.sliderBGroup.add(saddleBMesh);

    // 双轴承滚珠导向滑块 (CNC 倒角滑鞍)
    const sliderBlockGeo = createChamferedBlockGeometry(0.048, 0.018, 0.082, 0.002);
    const sliderBlock = new THREE.Mesh(sliderBlockGeo, this.titaniumSlateMat);
    sliderBlock.position.set(0, -0.004, 0);
    this.sliderBGroup.add(sliderBlock);

    // 滑块前部高精度读数指示游标指针 (正对前尺)
    const cursorPointer = new THREE.Mesh(
      createChamferedBlockGeometry(0.002, 0.014, 0.001, 0.0004),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    cursorPointer.position.set(0, -0.008, 0.042);
    this.sliderBGroup.add(cursorPointer);

    // 右端操作拉手总成 (连接 B 表外侧提环，供操作者直接拖拽)
    const handleArmX = 0.160;
    const handleGroup = new THREE.Group();
    handleGroup.position.set(handleArmX, 0.020, 0);

    // 精密香槟金滚花握柄
    const handleGripGeo = createKnurledBand(0.012, 0.044);
    const handleGrip = new THREE.Mesh(handleGripGeo, this.brassMat);
    handleGrip.rotation.x = Math.PI / 2;
    handleGroup.add(handleGrip);

    // 液态铬握把端头与连杆
    const handleStemGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.020, 16);
    const handleStem = new THREE.Mesh(handleStemGeo, this.chromeMat);
    handleStem.rotation.z = Math.PI / 2;
    handleStem.position.set(-0.010, 0, 0);
    handleGroup.add(handleStem);

    // 穿过 B 表提环的不锈钢连轴
    const handleLinkPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.038, 16),
      this.chromeMat
    );
    handleLinkPin.position.set(0, 0, 0);
    handleGroup.add(handleLinkPin);

    this.sliderBGroup.add(handleGroup);

    // 5. 床身前斜面毫米刻度激光蚀刻标尺
    this.createBenchScalePlate(benchLen, benchHeight, benchWidth, benchY);

    return handleGrip;
  }

  /**
   * 构建床身激光毫米标尺
   */
  private createBenchScalePlate(
    benchLen: number,
    benchHeight: number,
    benchWidth: number,
    benchY: number
  ): void {
    const scaleTex = createPrecisionRulerTexture({
      width: 2048,
      height: 128,
      maxCm: 80,
      unitText: 'cm',
      accentColor: '#0284c7',
    });

    if (scaleTex) {
      this.benchScaleTexture = scaleTex;
      const scalePlaneGeo = new THREE.PlaneGeometry(benchLen * 0.94, 0.016);
      const scalePlaneMat = new THREE.MeshBasicMaterial({ map: this.benchScaleTexture });
      const scalePlane = new THREE.Mesh(scalePlaneGeo, scalePlaneMat);
      scalePlane.position.set(0.04, benchY + benchHeight * 0.5 - 0.002, benchWidth * 0.5 + 0.001);
      this.benchGroup.add(scalePlane);
    }
  }

  /**
   * 构建挂钩互扣处的 3D 作用力与反作用力矢量箭羽
   */
  private createActionReactionVectors(): void {
    this.group.add(this.vectorGroup);
    this.vectorGroup.position.set(0, this.hoverHeightY, 0.024);

    this.vectorArrowA = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0.032, 0),
      0.001,
      0x38bdf8,
      0.014,
      0.008
    );
    this.vectorGroup.add(this.vectorArrowA);

    this.vectorArrowB = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0.032, 0),
      0.001,
      0xfb7185,
      0.014,
      0.008
    );
    this.vectorGroup.add(this.vectorArrowB);

    // 矢量中心标签 Sprite
    const canvas = safeCanvas(512, 128) || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (canvas) {
      canvas.width = 512;
      canvas.height = 128;
      this.vectorLabelTexture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({
        map: this.vectorLabelTexture,
        transparent: true,
        depthTest: false,
      });
      this.vectorLabelSprite = new THREE.Sprite(mat);
      this.vectorLabelSprite.scale.set(0.24, 0.06, 1.0);
      this.vectorLabelSprite.position.set(0, 0.065, 0);
      this.vectorGroup.add(this.vectorLabelSprite);
    }
  }

  /**
   * 构建前置深海蓝黑遥测数字面板 (正对操作者视线 +Z)
   */
  private createDashboard(): void {
    const canvas = safeCanvas(1024, 256) || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!canvas) return;

    canvas.width = 1024;
    canvas.height = 256;
    this.dashboardCanvas = canvas;
    this.dashboardCtx = canvas.getContext('2d') as CanvasRenderingContext2D;

    this.dashboardTexture = new THREE.CanvasTexture(canvas);
    this.dashboardTexture.minFilter = THREE.LinearFilter;
    this.dashboardTexture.magFilter = THREE.LinearFilter;

    // 前面板边框底板
    const panelWidth = 0.44;
    const panelHeight = 0.090;
    const panelGeo = new THREE.PlaneGeometry(panelWidth, panelHeight);
    const panelMat = new THREE.MeshBasicMaterial({
      map: this.dashboardTexture,
      transparent: true,
    });
    this.dashboardMesh = new THREE.Mesh(panelGeo, panelMat);
    this.dashboardMesh.position.set(0.04, this.hoverHeightY - 0.055, 0.075);
    this.group.add(this.dashboardMesh);

    this.renderDashboard(0, 0);
  }

  /**
   * 刷新前置深海蓝黑遥测数字面板内容
   */
  private renderDashboard(forceA: number, forceB: number): void {
    if (!this.dashboardCtx || !this.dashboardCanvas) return;
    const textKey = `${forceA.toFixed(2)}_${forceB.toFixed(2)}`;
    if (textKey === this.lastDashboardText) return;
    this.lastDashboardText = textKey;

    const ctx = this.dashboardCtx;
    const w = this.dashboardCanvas.width;
    const h = this.dashboardCanvas.height;

    // 深邃海洋蓝黑底色 (#08101e)
    ctx.fillStyle = '#08101e';
    if (typeof (ctx as any).roundRect === 'function') {
      ctx.beginPath();
      (ctx as any).roundRect(0, 0, w, h, 20);
      ctx.fill();
    } else if (typeof ctx.fillRect === 'function') {
      ctx.fillRect(0, 0, w, h);
    }

    // 细致科技青辉边框
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 6;
    if (typeof (ctx as any).roundRect === 'function') {
      ctx.stroke();
    }

    // 标题条
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 32px "SF Pro Display", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (typeof ctx.fillText === 'function') {
      ctx.fillText('NEWTON 3RD LAW TELEMETRY', 28, 24);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#34d399';
    if (typeof ctx.fillText === 'function') {
      ctx.fillText('STATUS: EQUAL & OPPOSITE', w - 28, 24);
    }

    // 分隔线
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    if (typeof ctx.beginPath === 'function') {
      ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(28, 68);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(w - 28, 68);
      if (typeof ctx.stroke === 'function') ctx.stroke();
    }

    // A 表达数
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 56px "SF Pro Display", "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(`F_A = ${forceA.toFixed(2)} N →`, 28, 125);
    }

    // B 表达数
    ctx.fillStyle = '#fb7185';
    ctx.font = 'bold 56px "SF Pro Display", "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(`← F_B = ${forceB.toFixed(2)} N`, w - 28, 125);
    }

    // 底部物理矢量判定式
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 36px "SF Pro Display", "JetBrains Mono", Arial, sans-serif';
    ctx.textAlign = 'center';
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(`F_A ≡ -F_B  |  ΔF = ${(Math.abs(forceA - forceB)).toFixed(3)} N`, w * 0.5, 205);
    }

    if (this.dashboardTexture) this.dashboardTexture.needsUpdate = true;
  }

  /**
   * 创建无卡片纯净空间力示数 Sprite
   */
  private createForceReadout(prefix: string, textColor: string): SpatialForceReadout {
    const canvas = safeCanvas(256, 64) || (typeof document !== 'undefined' ? document.createElement('canvas') : ({} as any));
    canvas.width = 256;
    canvas.height = 64;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d')! : ({} as any);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.14, 0.035, 1.0);
    sprite.raycast = () => {};

    return {
      sprite,
      canvas,
      ctx,
      texture,
      prefix,
      textColor,
      lastText: '',
    };
  }

  /**
   * 刷新力示数文字
   */
  private updateForceReadout(readout: SpatialForceReadout, forceN: number): void {
    const text = `${readout.prefix} = ${forceN.toFixed(2)} N`;
    if (text === readout.lastText) return;
    readout.lastText = text;

    const ctx = readout.ctx;
    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, readout.canvas.width, readout.canvas.height);
    }

    if (ctx.save) ctx.save();
    ctx.font = 'bold 32px "SF Pro Display", "JetBrains Mono", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (typeof ctx.strokeText === 'function') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(text, readout.canvas.width * 0.5, readout.canvas.height * 0.5);
    }

    ctx.fillStyle = readout.textColor;
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(text, readout.canvas.width * 0.5, readout.canvas.height * 0.5);
    }
    if (ctx.restore) ctx.restore();

    readout.texture.needsUpdate = true;
  }

  /**
   * 视觉主更新循环
   * 根据当前受力大小同步更新三只测力计的弹簧拉伸、读数游标、相扣秤钩与边侧空间力示数
   */
  public updateVisualState(
    soloForceN: number,
    pairForceN: number,
    _history?: TelemetryPoint[]
  ): void {
    // 1. 更新独立测力计
    this.soloDynamometer.setForce(soloForceN);
    this.updateForceReadout(this.labelSolo, soloForceN);
    this.updateWeightPosition(this.soloDynamometer.getDisplacement());

    // 2. 更新互扣测力计 A 与 B 的受力形变 (F_A ≡ F_B)
    this.dynamometerA.setForce(pairForceN);
    this.dynamometerB.setForce(pairForceN);
    this.updateForceReadout(this.labelA, pairForceN);
    this.updateForceReadout(this.labelB, pairForceN);

    // 3. 几何动力学连动：
    const dispM = this.dynamometerA.getDisplacement();
    const currentBX = this.pairRightBaseX + 2.0 * dispM;
    this.dynamometerB.group.position.x = currentBX;
    this.labelB.sprite.position.x = currentBX;

    this.sliderBGroup.position.x = currentBX;

    // 4. 更新咬合点矢量箭羽组位置与伸长
    const junctionX = dispM;
    this.vectorGroup.position.x = junctionX;

    const arrowLength = Math.max(0.001, (pairForceN / 5.0) * 0.055);
    this.vectorArrowA.setLength(arrowLength, Math.min(0.012, arrowLength * 0.35), Math.min(0.008, arrowLength * 0.25));
    this.vectorArrowB.setLength(arrowLength, Math.min(0.012, arrowLength * 0.35), Math.min(0.008, arrowLength * 0.25));
    this.vectorArrowA.visible = pairForceN > 0.02;
    this.vectorArrowB.visible = pairForceN > 0.02;
    if (this.vectorLabelSprite) {
      this.vectorLabelSprite.visible = pairForceN > 0.05;
    }

    // 5. 刷新前置深海蓝黑遥测仪表盘
    this.renderDashboard(pairForceN, pairForceN);
  }

  /**
   * 兼容按键接口
   */
  public animateButtonPress(_btnId: string): void {}

  /**
   * 资源深度安全销毁
   */
  public dispose(): void {
    this.soloDynamometer.dispose();
    this.dynamometerA.dispose();
    this.dynamometerB.dispose();

    this.labelSolo.texture.dispose();
    this.labelSolo.sprite.material.dispose();
    this.labelA.texture.dispose();
    this.labelA.sprite.material.dispose();
    this.labelB.texture.dispose();
    this.labelB.sprite.material.dispose();

    if (this.benchScaleTexture) this.benchScaleTexture.dispose();
    if (this.dashboardTexture) this.dashboardTexture.dispose();
    if (this.vectorLabelTexture) this.vectorLabelTexture.dispose();

    disposeObjectTree(this.group);
  }
}

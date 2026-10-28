/**
 * 3D 牛顿第三定律高保真实验台与测力计对拉装置 (Newton's Third Law Precision Laboratory Setup)
 *
 * 【工业级精雕建模与物理学核心规范】：
 * 1. 结构完整真实：
 *    - 底部配备科研级双导轨测力实验台 (航天喷砂银铝基座、双液态铬精密滑轨、左侧固定锚柱、右侧低摩擦滑块与精密滚花拉手)；
 *    - 左侧配备高品质不锈钢铁架台 (铸铁配重底座、垂直立柱、十字夹头与悬挂横梁)，稳稳托载独立测力计，杜绝空虚悬浮；
 * 2. 物理效果真实合理：
 *    - 两只互拉测力计 (A 表与 B 表) 挂钩真实互扣相勾，外侧提环分别锚定在左端柱与右端滑块；
 *    - 拉动右端时，两测力计挂钩紧密咬合在中心，随拉力平稳右移 \Delta x，B 表外壳与滑块右移 2*\Delta x；
 *    - 两螺旋弹簧严格同步伸长，两表红色游标精准指示完全相同的力示数 (F_A ≡ F_B)；
 * 3. 作用力与反作用力矢量指示：
 *    - 在挂钩咬合点实时呈现一对共线反向、大小严格相等的 3D 物理力矢量箭羽 (\vec{F}_{A \to B} 与 \vec{F}_{B \to A})；
 * 4. 实验台前置深海蓝黑数字仪表屏：
 *    - 正对操作者视线 (+Z)，高对比度清晰呈现 F_A、F_B、\Delta F 与牛顿第三定律矢量恒等式；
 * 5. 严格遵守零 DOM 弹窗/浮动向导原则，视界纯净，纯三维物理交互。
 */

import * as THREE from 'three';
import { SpringDynamometerMesh } from './SpringDynamometerMesh.ts';
import { disposeObjectTree, mechMetal } from './mechKit.ts';
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

  // 共享通用材质
  private chromeMat!: THREE.MeshStandardMaterial;
  private brassMat!: THREE.MeshStandardMaterial;
  private aluminumMat!: THREE.MeshStandardMaterial;
  private darkBaseMat!: THREE.MeshStandardMaterial;

  constructor() {
    this.group.name = 'NewtonThirdBenchMesh';

    this.initSharedMaterials();

    // 1. 实例化三只弹簧测力计
    // 独立测力计：垂直悬挂构型
    this.soloDynamometer = new SpringDynamometerMesh({
      label: 'SoloDynamometer',
      casingColor: 0x0d8275, // 孔雀青绿
      orientation: 'vertical',
    });

    // 互拉测力计 A：水平对拉构型，角色 A (居左，挂钩朝右)
    this.dynamometerA = new SpringDynamometerMesh({
      label: 'DynamometerA',
      casingColor: 0x0284c7, // 湛蓝海青 (物体 A)
      scaleSubLabel: 'A',
      orientation: 'horizontal_pair',
      pairRole: 'A',
    });

    // 互拉测力计 B：水平对拉构型，角色 B (居右，挂钩朝左)
    this.dynamometerB = new SpringDynamometerMesh({
      label: 'DynamometerB',
      casingColor: 0xe11d48, // 珊瑚绯红 (物体 B)
      scaleSubLabel: 'B',
      orientation: 'horizontal_pair',
      pairRole: 'B',
    });

    // 2. 空间定位布局
    // 独立测力计布局：左侧垂直，中心位于 Y = 0.22m
    this.soloDynamometer.group.position.set(this.soloBaseX, this.hoverHeightY, 0.0);
    this.soloDynamometer.group.rotation.set(0, 0, 0);
    this.group.add(this.soloDynamometer.group);

    // 互拉测力计 A 布局：水平朝右，中心位于 Y = 0.22m
    this.dynamometerA.group.position.set(this.pairAnchorBaseX, this.hoverHeightY, 0.0);
    this.dynamometerA.group.rotation.set(0, 0, -Math.PI / 2);
    this.group.add(this.dynamometerA.group);

    // 互拉测力计 B 布局：水平朝左，中心位于 Y = 0.22m，挂钩与 A 在中心紧扣
    this.dynamometerB.group.position.set(this.pairRightBaseX, this.hoverHeightY, 0.0025);
    this.dynamometerB.group.rotation.set(0, 0, Math.PI / 2);
    this.group.add(this.dynamometerB.group);

    // 3. 构建高品质铁架台支撑装置 (托载左侧独立测力计)
    this.createRetortStand();

    // 4. 构建科研级水平导轨实验台与右侧随动拉手滑块
    this.pullHandleMesh = this.createHorizontalRailBench();

    // 5. 构建挂钩咬合点 3D 作用力与反作用力矢量箭羽
    this.createActionReactionVectors();

    // 6. 构建前置深海蓝黑遥测数字面板
    this.createDashboard();

    // 7. 创建边侧纯空间浮空力示数
    this.labelSolo = this.createForceReadout('F', '#34d399');
    this.labelSolo.sprite.position.set(this.soloBaseX + 0.11, this.hoverHeightY, 0.01);
    this.group.add(this.labelSolo.sprite);

    this.labelA = this.createForceReadout('F_A', '#38bdf8');
    this.labelA.sprite.position.set(this.pairAnchorBaseX, this.hoverHeightY + 0.075, 0.01);
    this.group.add(this.labelA.sprite);

    this.labelB = this.createForceReadout('F_B', '#fb7185');
    this.labelB.sprite.position.set(this.pairRightBaseX, this.hoverHeightY + 0.075, 0.01);
    this.group.add(this.labelB.sprite);

    // 初始化初始力显示 (0.00 N)
    this.updateForceReadout(this.labelSolo, 0);
    this.updateForceReadout(this.labelA, 0);
    this.updateForceReadout(this.labelB, 0);
  }

  /**
   * 初始化通用工程与物理材质
   */
  private initSharedMaterials(): void {
    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.08,
    });

    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.88,
      roughness: 0.22,
    });

    this.aluminumMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.82,
      roughness: 0.25,
    });

    this.darkBaseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.70,
      roughness: 0.35,
    });
  }

  /**
   * 构建高品质物理实验室铁架台 (支撑独立测力计)
   */
  private createRetortStand(): void {
    this.standGroup.position.set(this.soloBaseX - 0.09, 0, 0);
    this.group.add(this.standGroup);

    // 1. 铸铁倒角重底座
    const baseGeo = new THREE.BoxGeometry(0.18, 0.018, 0.14);
    const baseMesh = new THREE.Mesh(baseGeo, this.darkBaseMat);
    baseMesh.position.set(0, 0.009, 0);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.standGroup.add(baseMesh);

    // 四角防滑橡胶脚垫
    const footGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.004, 16);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const footOffsets = [
      [-0.075, -0.055],
      [-0.075, 0.055],
      [0.075, -0.055],
      [0.075, 0.055],
    ];
    for (const [fx, fz] of footOffsets) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, 0.002, fz);
      this.standGroup.add(foot);
    }

    // 2. 垂直立柱与螺纹法兰凸台
    const flangeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.012, 24),
      mechMetal(0x334155, 0.85, 0.25)
    );
    flangeMesh.position.set(0, 0.024, 0);
    this.standGroup.add(flangeMesh);

    const poleHeight = 0.46;
    const poleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, poleHeight, 24),
      this.chromeMat
    );
    poleMesh.position.set(0, poleHeight * 0.5 + 0.018, 0);
    this.standGroup.add(poleMesh);

    // 立柱顶部安全球帽
    const poleCap = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 16), this.chromeMat);
    poleCap.position.set(0, poleHeight + 0.018, 0);
    this.standGroup.add(poleCap);

    // 3. 十字夹套 (Bosshead clamp) 与精密黄铜滚花紧固旋钮
    const clampHeightY = this.hoverHeightY + 0.145; // 刚好对齐独立测力计顶部提环
    const clampMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.024, 0.026),
      mechMetal(0x334155, 0.85, 0.25)
    );
    clampMesh.position.set(0, clampHeightY, 0);
    this.standGroup.add(clampMesh);

    const knobMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.012, 24),
      this.brassMat
    );
    knobMesh.rotation.z = Math.PI / 2;
    knobMesh.position.set(-0.016, clampHeightY, 0);
    this.standGroup.add(knobMesh);

    // 4. 水平横向悬挂臂 (伸向测力计提环正上方)
    const armLen = 0.11;
    const armMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, armLen, 20),
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
    // 砝码托盘与吊杆
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

    // 底部圆托盘
    const panGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.004, 32);
    const panMesh = new THREE.Mesh(panGeo, this.brassMat);
    panMesh.position.y = -0.042;
    trayGroup.add(panMesh);

    // 标准 100g 镀铬开槽砝码 1 (对应 ~1N 重力)
    const discGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.008, 32);
    const weight1 = new THREE.Mesh(discGeo, this.chromeMat);
    weight1.position.y = -0.036;
    weight1.name = 'weight-disc-1';
    weight1.visible = false;
    trayGroup.add(weight1);
    this.weightMeshes.push(weight1);

    // 标准 100g 镀铬开槽砝码 2 (对应累计 ~2N 重力)
    const weight2 = new THREE.Mesh(discGeo, this.chromeMat);
    weight2.position.y = -0.027;
    weight2.name = 'weight-disc-2';
    weight2.visible = false;
    trayGroup.add(weight2);
    this.weightMeshes.push(weight2);

    this.weightGroup.add(trayGroup);
    // 初始对准独立测力计底部秤钩
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

    // 1. 航空喷砂阳极氧化银铝基座床身
    const benchLen = 0.88;
    const benchWidth = 0.13;
    const benchHeight = 0.022;
    const benchY = this.hoverHeightY - 0.055; // 床身表面高度 Y ≈ 0.165m，与测力计保持黄金间隙

    const bedGeo = new THREE.BoxGeometry(benchLen, benchHeight, benchWidth);
    const bedMesh = new THREE.Mesh(bedGeo, this.aluminumMat);
    bedMesh.position.set(0.04, benchY, 0);
    bedMesh.castShadow = true;
    bedMesh.receiveShadow = true;
    this.benchGroup.add(bedMesh);

    // 床身四角减震防滑橡胶垫
    const footGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 16);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const footPos = [
      [-benchLen * 0.46 + 0.04, -benchWidth * 0.42],
      [-benchLen * 0.46 + 0.04, benchWidth * 0.42],
      [benchLen * 0.46 + 0.04, -benchWidth * 0.42],
      [benchLen * 0.46 + 0.04, benchWidth * 0.42],
    ];
    for (const [bx, bz] of footPos) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(bx, benchY - benchHeight * 0.5 - 0.003, bz);
      this.benchGroup.add(foot);
    }

    // 2. 双路液态铬不锈钢精密滑杆
    const rodLen = benchLen * 0.94;
    const rodRadius = 0.0035;
    const rodZOffset = 0.034;
    const railY = benchY + benchHeight * 0.5 + 0.014;

    for (const zSign of [-1, 1]) {
      const railMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(rodRadius, rodRadius, rodLen, 24),
        this.chromeMat
      );
      railMesh.rotation.z = Math.PI / 2;
      railMesh.position.set(0.04, railY, zSign * rodZOffset);
      this.benchGroup.add(railMesh);

      // 导轨两端固定安装枕块
      for (const xSign of [-1, 1]) {
        const pillowBlock = new THREE.Mesh(
          new THREE.BoxGeometry(0.024, 0.020, 0.016),
          mechMetal(0x334155, 0.85, 0.25)
        );
        pillowBlock.position.set(0.04 + xSign * (rodLen * 0.5 - 0.012), railY - 0.004, zSign * rodZOffset);
        this.benchGroup.add(pillowBlock);
      }
    }

    // 3. 左侧测力计 A 固定锚柱 (锁定测力计 A 的左侧提环)
    const anchorX = this.pairAnchorBaseX - 0.160; // ~ -0.320m
    this.leftAnchorGroup.position.set(anchorX, railY, 0);

    const anchorPillarGeo = new THREE.BoxGeometry(0.030, 0.048, 0.056);
    const anchorPillar = new THREE.Mesh(anchorPillarGeo, mechMetal(0x334155, 0.85, 0.25));
    anchorPillar.position.set(0, 0.014, 0);
    this.leftAnchorGroup.add(anchorPillar);

    // 紧固黄铜滚花手轮
    const thumbKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.014, 24),
      this.brassMat
    );
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

    // 双轴承滚珠导向滑块
    const sliderBlockGeo = new THREE.BoxGeometry(0.048, 0.018, 0.082);
    const sliderBlock = new THREE.Mesh(sliderBlockGeo, mechMetal(0x334155, 0.85, 0.25));
    sliderBlock.position.set(0, -0.004, 0);
    this.sliderBGroup.add(sliderBlock);

    // 右端操作拉手总成 (连接 B 表外侧提环，供操作者直接拖拽)
    const handleArmX = 0.160; // 对应 B 表外侧提环位置 (0.16 + 0.16 = 0.32m)
    const handleGroup = new THREE.Group();
    handleGroup.position.set(handleArmX, 0.020, 0);

    // 精密香槟金滚花握柄
    const handleGripGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.044, 28);
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
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, canvas.height - 10);
    ctx.lineTo(canvas.width - 40, canvas.height - 10);
    ctx.stroke();

    const numMarks = 40;
    const dPx = (canvas.width - 80) / numMarks;
    for (let i = 0; i <= numMarks; i++) {
      const x = 40 + i * dPx;
      const isMajor = i % 5 === 0;
      ctx.lineWidth = isMajor ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(x, canvas.height - 10);
      ctx.lineTo(x, canvas.height - (isMajor ? 46 : 24));
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 36px "SF Pro Display", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(i * 10), x, canvas.height - 52);
      }
    }

    this.benchScaleTexture = new THREE.CanvasTexture(canvas);
    const scalePlaneGeo = new THREE.PlaneGeometry(benchLen * 0.92, 0.016);
    const scalePlaneMat = new THREE.MeshBasicMaterial({ map: this.benchScaleTexture });
    const scalePlane = new THREE.Mesh(scalePlaneGeo, scalePlaneMat);
    // 置于基座前边缘微斜面上
    scalePlane.position.set(0.04, benchY + benchHeight * 0.5 - 0.002, benchWidth * 0.5 + 0.001);
    this.benchGroup.add(scalePlane);
  }

  /**
   * 构建挂钩互扣处的 3D 作用力与反作用力矢量箭羽
   */
  private createActionReactionVectors(): void {
    this.group.add(this.vectorGroup);
    this.vectorGroup.position.set(0, this.hoverHeightY, 0.024);

    // 矢量箭羽：初值长度为 0 (随拉力平滑伸长)
    // 箭羽 A：\vec{F}_{B \to A} (测力计 B 施加给 A 的拉力，方向向右 +X，湛蓝高对比度)
    this.vectorArrowA = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0.032, 0),
      0.001,
      0x38bdf8,
      0.014,
      0.008
    );
    this.vectorGroup.add(this.vectorArrowA);

    // 箭羽 B：\vec{F}_{A \to B} (测力计 A 施加给 B 的反作用力，方向向左 -X，珊瑚绯红)
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
    const canvas = document.createElement('canvas');
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

  /**
   * 构建前置深海蓝黑遥测数字面板 (正对操作者视线 +Z)
   */
  private createDashboard(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    this.dashboardCanvas = canvas;
    this.dashboardCtx = canvas.getContext('2d')!;

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
    // 正直朝向操作者 (+Z)，位于导轨床身正前方外侧
    this.dashboardMesh.position.set(0.04, this.hoverHeightY - 0.055, 0.075);
    this.group.add(this.dashboardMesh);

    this.renderDashboard(0, 0);
  }

  /**
   * 刷新前置深海蓝黑遥测数字面板内容
   */
  private renderDashboard(forceA: number, forceB: number): void {
    const textKey = `${forceA.toFixed(2)}_${forceB.toFixed(2)}`;
    if (textKey === this.lastDashboardText) return;
    this.lastDashboardText = textKey;

    const ctx = this.dashboardCtx;
    const w = this.dashboardCanvas.width;
    const h = this.dashboardCanvas.height;

    // 深邃海洋蓝黑底色 (#08101e)
    ctx.fillStyle = '#08101e';
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 20);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, w, h);
    }

    // 细致科技青辉边框
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 6;
    if (typeof ctx.roundRect === 'function') {
      ctx.stroke();
    }

    // 标题条
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 32px "SF Pro Display", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('NEWTON 3RD LAW TELEMETRY', 28, 24);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#34d399';
    ctx.fillText('STATUS: EQUAL & OPPOSITE', w - 28, 24);

    // 分隔线
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(28, 68);
    ctx.lineTo(w - 28, 68);
    ctx.stroke();

    // A 表达数
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 56px "SF Pro Display", "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`F_A = ${forceA.toFixed(2)} N →`, 28, 125);

    // B 表达数
    ctx.fillStyle = '#fb7185';
    ctx.font = 'bold 56px "SF Pro Display", "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`← F_B = ${forceB.toFixed(2)} N`, w - 28, 125);

    // 底部物理矢量判定式
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 36px "SF Pro Display", "JetBrains Mono", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`F_A ≡ -F_B  |  ΔF = ${(Math.abs(forceA - forceB)).toFixed(3)} N`, w * 0.5, 205);

    this.dashboardTexture.needsUpdate = true;
  }

  /**
   * 创建无卡片纯净空间力示数 Sprite
   */
  private createForceReadout(prefix: string, textColor: string): SpatialForceReadout {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

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
    ctx.clearRect(0, 0, readout.canvas.width, readout.canvas.height);

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
    // - 测力计 A 左端固定，挂钩向右伸长 \Delta x
    // - 挂钩咬合点位置精确为 X = \Delta x
    // - 测力计 B 整体外壳与托架向右移动 2 * \Delta x
    // - B 表挂钩相对于其外壳向左伸长 \Delta x，保持咬合点在 X = \Delta x 严丝合缝
    const dispM = this.dynamometerA.getDisplacement();
    const currentBX = this.pairRightBaseX + 2.0 * dispM;
    this.dynamometerB.group.position.x = currentBX;
    this.labelB.sprite.position.x = currentBX;

    // 滑块托架跟随 B 表外壳平移
    this.sliderBGroup.position.x = currentBX;

    // 4. 更新咬合点矢量箭羽组位置与伸长
    const junctionX = dispM; // 挂钩咬合中心点精准沿 X 移动 dispM
    this.vectorGroup.position.x = junctionX;

    const arrowLength = Math.max(0.001, (pairForceN / 5.0) * 0.055);
    this.vectorArrowA.setLength(arrowLength, Math.min(0.012, arrowLength * 0.35), Math.min(0.008, arrowLength * 0.25));
    this.vectorArrowB.setLength(arrowLength, Math.min(0.012, arrowLength * 0.35), Math.min(0.008, arrowLength * 0.25));
    this.vectorArrowA.visible = pairForceN > 0.02;
    this.vectorArrowB.visible = pairForceN > 0.02;
    this.vectorLabelSprite.visible = pairForceN > 0.05;

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

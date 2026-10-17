/**
 * 悬挂法测物体重心实验 - 铁架台与悬挂装置 3D 模型
 */

import * as THREE from 'three';
import { mechMetal, disposeObjectTree } from './mechKit.ts';

export class RetortStandMesh {
  public readonly group = new THREE.Group();

  // 关键物理连接点位置 (局部坐标系) - 挂钩底部承托小孔的中心位置
  public readonly pinLocalPosition = new THREE.Vector3(0, 0.38, 0.04);

  // 3D 部件引用
  private baseMesh!: THREE.Mesh;
  private rodMesh!: THREE.Mesh;
  private clampGroup = new THREE.Group();
  private armMesh!: THREE.Mesh;
  public hookMesh!: THREE.Mesh;
  public pinMesh!: THREE.Mesh; // 保持向后兼容性别名
  public snapAuraMesh!: THREE.Mesh;
  public snapTargetGuide!: THREE.Line;
  private needleStandGroup = new THREE.Group();

  // 材质引用以支持高亮与清理
  private snapAuraMaterial!: THREE.MeshBasicMaterial;
  private snapGuideMaterial!: THREE.LineDashedMaterial;
  private hookMaterial!: THREE.MeshStandardMaterial;

  constructor() {
    this.createStandBaseAndPole();
    this.createClampAndArm();
    this.createSuspensionHook();
    this.createNeedleVerificationStand();
  }

  /**
   * 1. 铸铁底座与垂直立杆
   */
  private createStandBaseAndPole(): void {
    // 铸铁重底座 (长方形倒角结构)
    const baseGeo = new THREE.BoxGeometry(0.22, 0.022, 0.18);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.35,
    });
    this.baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.baseMesh.position.set(-0.13, 0.011, 0.02);
    this.baseMesh.castShadow = true;
    this.baseMesh.receiveShadow = true;
    this.group.add(this.baseMesh);

    // 底座四角防滑橡胶脚垫
    const padGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.004, 16);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const padOffsets = [
      [-0.22, 0.09],
      [-0.22, -0.05],
      [-0.04, 0.09],
      [-0.04, -0.05],
    ];
    for (const [px, pz] of padOffsets) {
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(px, 0.002, pz);
      this.group.add(pad);
    }

    // 底座与立柱的螺纹连接安装法兰凸台
    const flangeGeo = new THREE.CylinderGeometry(0.013, 0.015, 0.014, 24);
    const flangeMat = mechMetal(0x334155, 0.85, 0.25);
    const flangeMesh = new THREE.Mesh(flangeGeo, flangeMat);
    flangeMesh.position.set(-0.16, 0.025, 0.02);
    this.group.add(flangeMesh);

    // 垂直镀铬不锈钢立柱
    const rodGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.50, 24);
    const rodMat = mechMetal(0xe2e8f0, 0.95, 0.12);
    this.rodMesh = new THREE.Mesh(rodGeo, rodMat);
    this.rodMesh.position.set(-0.16, 0.27, 0.02);
    this.rodMesh.castShadow = true;
    this.group.add(this.rodMesh);

    // 立柱顶部装饰安全球帽
    const capGeo = new THREE.SphereGeometry(0.010, 16, 16);
    const capMesh = new THREE.Mesh(capGeo, rodMat);
    capMesh.position.set(-0.16, 0.52, 0.02);
    this.group.add(capMesh);
  }

  /**
   * 2. 十字夹套 (Bosshead) 与水平横梁杆
   */
  private createClampAndArm(): void {
    const clampMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.30,
    });

    // 夹头主体 (双孔交叉结构块)
    const clampBody = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.036, 0.028), clampMat);
    this.clampGroup.add(clampBody);

    // 紧固黄铜旋钮 (Thumbscrews)
    const screwGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.018, 16);
    const screwHeadGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16);
    const screwMat = mechMetal(0xf59e0b, 0.9, 0.2); // 黄铜色旋钮

    // 旋钮 1：锁紧立柱 (向后延伸)
    const screw1 = new THREE.Mesh(screwGeo, screwMat);
    screw1.rotation.x = Math.PI / 2;
    screw1.position.set(0, 0, -0.016);
    const screwHead1 = new THREE.Mesh(screwHeadGeo, screwMat);
    screwHeadHeadWing(screwHead1);
    screwHead1.rotation.x = Math.PI / 2;
    screwHead1.position.set(0, 0, -0.025);
    this.clampGroup.add(screw1, screwHead1);

    // 旋钮 2：锁紧横杆 (向左延伸)
    const screw2 = new THREE.Mesh(screwGeo, screwMat);
    screw2.rotation.z = Math.PI / 2;
    screw2.position.set(-0.016, 0, 0);
    const screwHead2 = new THREE.Mesh(screwHeadGeo, screwMat);
    screwHeadHeadWing(screwHead2);
    screwHead2.rotation.z = Math.PI / 2;
    screwHead2.position.set(-0.025, 0, 0);
    this.clampGroup.add(screw2, screwHead2);

    // 放置夹头在立柱相应高度上
    this.clampGroup.position.set(-0.16, 0.44, 0.02);
    this.group.add(this.clampGroup);

    // 水平横梁杆 (真实穿透十字夹套，沿 X 轴水平延伸至挂钩悬挂位置)
    // 从 X = -0.20 延伸至 X = +0.06，总长 0.26m
    const armLength = 0.26;
    const armGeo = new THREE.CylinderGeometry(0.0055, 0.0055, armLength, 24);
    const armMat = mechMetal(0xe2e8f0, 0.95, 0.15);
    this.armMesh = new THREE.Mesh(armGeo, armMat);
    this.armMesh.rotation.z = Math.PI / 2; // 沿 X 轴水平横置
    this.armMesh.position.set(-0.07, 0.44, 0.02);
    this.armMesh.castShadow = true;
    this.group.add(this.armMesh);

    // 横梁杆两端装饰倒角球头
    const endGeo = new THREE.SphereGeometry(0.0065, 16, 16);
    const endLeft = new THREE.Mesh(endGeo, armMat);
    endLeft.position.set(-0.20, 0.44, 0.02);
    const endRight = new THREE.Mesh(endGeo, armMat);
    endRight.position.set(0.06, 0.44, 0.02);
    this.group.add(endLeft, endRight);
  }

  /**
   * 3. 悬挂挂钩 (挂在横杆上，承托薄板小孔) 与吸附指引
   */
  private createSuspensionHook(): void {
    // 挂在横杆上的固定套环 (位于 X=0, Y=0.44, Z=0.02 处)
    const collarGroup = new THREE.Group();
    collarGroup.position.set(0, 0.44, 0.02);

    const collarGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.014, 20);
    const collarMat = mechMetal(0xf59e0b, 0.9, 0.2); // 黄铜套环
    const collarMesh = new THREE.Mesh(collarGeo, collarMat);
    collarMesh.rotation.z = Math.PI / 2; // 套在横杆上
    collarGroup.add(collarMesh);

    // 套环上方的紧固小滚花螺钉
    const collarScrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0025, 0.0025, 0.007, 12),
      mechMetal(0xd97706, 0.85, 0.25)
    );
    collarScrew.position.set(0, 0.007, 0);
    collarGroup.add(collarScrew);
    this.group.add(collarGroup);

    // 挂钩本体 (从横杆套环垂直向下延伸，并在底部弯成精美的金属托钩)
    // 采用 CatmullRomCurve3 三维样条曲线构建光滑管道模型
    // 挂钩局部坐标系原点设在 pinLocalPosition (0, 0.38, 0.04) 处
    const hookCurvePoints = [
      new THREE.Vector3(0, 0.052, -0.020),  // 顶端连接至套环底部
      new THREE.Vector3(0, 0.034, -0.018),  // 笔直竖向悬垂下行细杆
      new THREE.Vector3(0, 0.016, -0.012),  // 柔和向前下方探出，靠近薄板孔位平面
      new THREE.Vector3(0, 0.004, -0.005),  // 穿入小孔背部空间
      new THREE.Vector3(0, -0.006, 0.000), // 挂钩底部承托弧面 (恰好承接半径 6mm 小孔内壁底端)
      new THREE.Vector3(0, 0.000, 0.008),  // 向上向前穿过小孔内径
      new THREE.Vector3(0, 0.014, 0.014),  // 挂钩前端微翘起的防脱安全钩尖
    ];
    const hookCurve = new THREE.CatmullRomCurve3(hookCurvePoints);
    const hookGeo = new THREE.TubeGeometry(hookCurve, 48, 0.0016, 16, false);
    this.hookMaterial = mechMetal(0xffd700, 0.95, 0.15); // 优雅的镜面金黄色合金挂钩
    this.hookMesh = new THREE.Mesh(hookGeo, this.hookMaterial);
    this.hookMesh.castShadow = true;

    // 钩尖安全小圆珠端帽
    const tipSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.0024, 16, 16),
      this.hookMaterial
    );
    tipSphere.position.set(0, 0.014, 0.014);
    this.hookMesh.add(tipSphere);

    // 挂钩定位至 pinLocalPosition
    this.hookMesh.position.copy(this.pinLocalPosition);
    this.hookMesh.name = 'suspension-hook';
    this.hookMesh.userData = { isSuspensionPin: true, isHook: true };
    this.pinMesh = this.hookMesh; // 保持向后兼容性别名
    this.group.add(this.hookMesh);

    // 悬挂挂钩磁吸指引光环
    const auraGeo = new THREE.TorusGeometry(0.024, 0.0025, 16, 32);
    this.snapAuraMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });
    this.snapAuraMesh = new THREE.Mesh(auraGeo, this.snapAuraMaterial);
    this.snapAuraMesh.position.copy(this.pinLocalPosition);
    this.snapAuraMesh.position.z += 0.004;
    this.group.add(this.snapAuraMesh);

    // 磁吸导引虚线 (连接挂钩托心与被拖拽孔)
    const guideGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    this.snapGuideMaterial = new THREE.LineDashedMaterial({
      color: 0x22c55e,
      dashSize: 0.01,
      gapSize: 0.006,
      transparent: true,
      opacity: 0,
    });
    this.snapTargetGuide = new THREE.Line(guideGeo, this.snapGuideMaterial);
    this.group.add(this.snapTargetGuide);
  }

  /**
   * 4. 重心平衡验证立柱与顶针
   */
  private createNeedleVerificationStand(): void {
    const standMat = mechMetal(0x64748b, 0.85, 0.25);
    const needleMat = mechMetal(0xf1f5f9, 0.95, 0.1);

    // 顶针底座
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.015, 32), standMat);
    base.position.y = 0.0075;
    this.needleStandGroup.add(base);

    // 顶针立杆
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.19, 20), standMat);
    rod.position.y = 0.105;
    this.needleStandGroup.add(rod);

    // 尖锐锋利顶针尖
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.02, 24), needleMat);
    tip.position.y = 0.20 + 0.01;
    this.needleStandGroup.add(tip);

    this.needleStandGroup.position.set(0.18, 0, 0.04);
    this.needleStandGroup.visible = false;
    this.group.add(this.needleStandGroup);
  }

  /**
   * 设置吸附光环的高亮程度及动态引线
   */
  public setSnapAuraHighlighted(isNearby: boolean, targetHolePos?: THREE.Vector3): void {
    if (isNearby) {
      this.snapAuraMaterial.color.setHex(0x22c55e); // 亮绿吸附色
      this.snapAuraMaterial.opacity = 0.95;
      this.snapAuraMesh.scale.setScalar(1.35);

      if (targetHolePos) {
        const positions = new Float32Array([
          this.pinLocalPosition.x, this.pinLocalPosition.y, this.pinLocalPosition.z,
          targetHolePos.x, targetHolePos.y, targetHolePos.z,
        ]);
        this.snapTargetGuide.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.snapTargetGuide.computeLineDistances();
        this.snapGuideMaterial.opacity = 0.9;
        this.snapTargetGuide.visible = true;
      }
    } else {
      this.snapAuraMaterial.color.setHex(0x38bdf8);
      this.snapAuraMaterial.opacity = 0.40;
      this.snapAuraMesh.scale.setScalar(1.0);
      this.snapGuideMaterial.opacity = 0;
      this.snapTargetGuide.visible = false;
    }
  }

  /**
   * 切换顶针验证装置的可见性
   */
  public setNeedleStandVisible(visible: boolean, targetPos?: THREE.Vector3): void {
    this.needleStandGroup.visible = visible;
    if (visible && targetPos) {
      this.needleStandGroup.position.set(targetPos.x, 0, targetPos.z);
    }
  }

  /**
   * 动画更新
   */
  public update(elapsed: number): void {
    if (this.snapAuraMesh) {
      this.snapAuraMesh.rotation.z = elapsed * 1.5;
    }
  }

  /**
   * 安全销毁 GPU 资源
   */
  public dispose(): void {
    disposeObjectTree(this.group);
  }
}

/**
 * 辅助构建旋钮蝶形手柄
 */
function screwHeadHeadWing(headMesh: THREE.Mesh): void {
  const wingGeo = new THREE.BoxGeometry(0.024, 0.004, 0.005);
  const wing = new THREE.Mesh(wingGeo, headMesh.material);
  wing.position.set(0, 0, 0.003);
  headMesh.add(wing);
}

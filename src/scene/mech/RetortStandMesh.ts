/**
 * 悬挂法测物体重心实验 - 铁架台与悬挂装置 3D 模型
 */

import * as THREE from 'three';
import { mechMetal, disposeObjectTree } from './mechKit.ts';

export class RetortStandMesh {
  public readonly group = new THREE.Group();

  // 关键物理连接点位置 (全局/局部坐标)
  public readonly pinWorldPosition = new THREE.Vector3(0, 0.40, 0.04);

  // 3D 部件引用
  private baseMesh: THREE.Mesh;
  private rodMesh: THREE.Mesh;
  private clampGroup = new THREE.Group();
  private armMesh: THREE.Mesh;
  public pinMesh: THREE.Mesh;
  public snapAuraMesh: THREE.Mesh;
  private plumbLine: THREE.Line;
  private plumbBobMesh: THREE.Mesh;
  private needleStandGroup = new THREE.Group();

  // 材质引用以支持高亮与清理
  private snapAuraMaterial: THREE.MeshBasicMaterial;
  private plumbLineMaterial: THREE.LineBasicMaterial;
  private needleStandVisible = false;

  constructor() {
    this.createStandBaseAndPole();
    this.createClampAndArm();
    this.createSuspensionPinAndPlumb();
    this.createNeedleVerificationStand();
  }

  /**
   * 1. 铸铁底座与垂直立杆
   */
  private createStandBaseAndPole(): void {
    // 铸铁重底座 (长方形倒角结构)
    const baseGeo = new THREE.BoxGeometry(0.20, 0.024, 0.16);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x242b33,
      metalness: 0.65,
      roughness: 0.45,
    });
    this.baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.baseMesh.position.set(-0.06, 0.012, -0.04);
    this.baseMesh.castShadow = true;
    this.baseMesh.receiveShadow = true;
    this.group.add(this.baseMesh);

    // 垂直镀铬不锈钢立柱
    const rodGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.52, 24);
    const rodMat = mechMetal(0xe2e8f0, 0.95, 0.15);
    this.rodMesh = new THREE.Mesh(rodGeo, rodMat);
    this.rodMesh.position.set(-0.12, 0.26, -0.08);
    this.rodMesh.castShadow = true;
    this.group.add(this.rodMesh);

    // 立柱顶部装饰安全球帽
    const capGeo = new THREE.SphereGeometry(0.009, 16, 16);
    const capMesh = new THREE.Mesh(capGeo, rodMat);
    capMesh.position.set(-0.12, 0.52, -0.08);
    this.group.add(capMesh);
  }

  /**
   * 2. 十字夹套 (Bosshead) 与悬臂横梁
   */
  private createClampAndArm(): void {
    const clampMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.35,
    });

    // 夹头主体
    const clampBody = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.028, 0.024), clampMat);
    this.clampGroup.add(clampBody);

    // 两个调节旋钮 (Thumbscrews)
    const screwGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.018, 16);
    const screwHeadGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.005, 16);
    const screwMat = mechMetal(0xf59e0b, 0.85, 0.25); // 黄铜色旋钮

    const screw1 = new THREE.Mesh(screwGeo, screwMat);
    screw1.rotation.z = Math.PI / 2;
    screw1.position.set(-0.016, 0, 0);
    const screwHead1 = new THREE.Mesh(screwHeadGeo, screwMat);
    screwHead1.rotation.z = Math.PI / 2;
    screwHead1.position.set(-0.024, 0, 0);
    this.clampGroup.add(screw1, screwHead1);

    // 放置夹头在立柱上
    this.clampGroup.position.set(-0.12, 0.40, -0.08);
    this.group.add(this.clampGroup);

    // 水平横梁杆 (连接夹头并向前伸展)
    const armGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.17, 20);
    const armMat = mechMetal(0xe2e8f0, 0.92, 0.18);
    this.armMesh = new THREE.Mesh(armGeo, armMat);
    this.armMesh.rotation.x = Math.PI / 2;
    // 使得横梁从立柱延伸至 Z=0.04, X=0
    this.armMesh.position.set(-0.06, 0.40, -0.02);
    this.armMesh.rotation.z = -0.32; // 稍微斜向前伸展到正中心
    this.armMesh.castShadow = true;
    this.group.add(this.armMesh);
  }

  /**
   * 3. 悬挂横销与真实铅锤细线
   */
  private createSuspensionPinAndPlumb(): void {
    // 悬挂横销 (供薄板孔套挂的小圆轴)
    const pinGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.045, 16);
    const pinMat = mechMetal(0xffd700, 0.9, 0.2); // 精致金色镀层
    this.pinMesh = new THREE.Mesh(pinGeo, pinMat);
    this.pinMesh.rotation.x = Math.PI / 2;
    this.pinMesh.position.copy(this.pinWorldPosition);
    this.pinMesh.name = 'suspension-pin';
    this.pinMesh.userData = { isSuspensionPin: true };
    this.group.add(this.pinMesh);

    // 悬挂横销吸附指引光环 (平时微弱，孔靠近时变亮变绿)
    const auraGeo = new THREE.TorusGeometry(0.016, 0.002, 16, 32);
    this.snapAuraMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
    });
    this.snapAuraMesh = new THREE.Mesh(auraGeo, this.snapAuraMaterial);
    this.snapAuraMesh.position.copy(this.pinWorldPosition);
    this.snapAuraMesh.position.z += 0.005;
    this.group.add(this.snapAuraMesh);

    // 悬挂细线 (从销钉根部垂直向下悬垂)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(this.pinWorldPosition.x, this.pinWorldPosition.y, this.pinWorldPosition.z - 0.006),
      new THREE.Vector3(this.pinWorldPosition.x, this.pinWorldPosition.y - 0.28, this.pinWorldPosition.z - 0.006),
    ]);
    this.plumbLineMaterial = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      linewidth: 1.5,
    });
    this.plumbLine = new THREE.Line(lineGeo, this.plumbLineMaterial);
    this.group.add(this.plumbLine);

    // 细线下端的黄铜铅锤 (Plumb Bob - 倒圆锥几何体)
    const bobGeo = new THREE.ConeGeometry(0.012, 0.032, 24);
    const bobMat = mechMetal(0xd97706, 0.9, 0.22); // 纯黄铜质感
    this.plumbBobMesh = new THREE.Mesh(bobGeo, bobMat);
    this.plumbBobMesh.rotation.x = Math.PI; // 尖端朝下
    this.plumbBobMesh.position.set(
      this.pinWorldPosition.x,
      this.pinWorldPosition.y - 0.28,
      this.pinWorldPosition.z - 0.006
    );
    this.group.add(this.plumbBobMesh);
  }

  /**
   * 4. 重心平衡验证立柱与顶针
   */
  private createNeedleVerificationStand(): void {
    const standMat = mechMetal(0x64748b, 0.8, 0.3);
    const needleMat = mechMetal(0xf1f5f9, 0.95, 0.1);

    // 顶针底座
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.012, 32), standMat);
    base.position.y = 0.006;
    this.needleStandGroup.add(base);

    // 顶针立杆
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.18, 20), standMat);
    rod.position.y = 0.10;
    this.needleStandGroup.add(rod);

    // 尖锐锋利顶针尖
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.018, 24), needleMat);
    tip.position.y = 0.19 + 0.009;
    this.needleStandGroup.add(tip);

    this.needleStandGroup.position.set(0.20, 0, 0.04);
    this.needleStandGroup.visible = false;
    this.group.add(this.needleStandGroup);
  }

  /**
   * 设置吸附光环的高亮程度
   * @param isNearby 是否有孔靠近吸附范围
   */
  public setSnapAuraHighlighted(isNearby: boolean): void {
    if (isNearby) {
      this.snapAuraMaterial.color.setHex(0x22c55e); // 亮绿吸附色
      this.snapAuraMaterial.opacity = 0.95;
      this.snapAuraMesh.scale.setScalar(1.25);
    } else {
      this.snapAuraMaterial.color.setHex(0x38bdf8); // 柔和科技蓝
      this.snapAuraMaterial.opacity = 0.35;
      this.snapAuraMesh.scale.setScalar(1.0);
    }
  }

  /**
   * 切换顶针验证装置的可见性
   */
  public setNeedleStandVisible(visible: boolean, targetPos?: THREE.Vector3): void {
    this.needleStandVisible = visible;
    this.needleStandGroup.visible = visible;
    if (visible && targetPos) {
      this.needleStandGroup.position.set(targetPos.x, 0, targetPos.z);
    }
  }

  /**
   * 动画更新 (光环微弱旋转或脉冲)
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

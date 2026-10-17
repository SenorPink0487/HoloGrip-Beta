/**
 * 悬挂法测物体重心实验 - 铁架台与悬挂装置 3D 模型
 */

import * as THREE from 'three';
import { mechMetal, disposeObjectTree } from './mechKit.ts';

export class RetortStandMesh {
  public readonly group = new THREE.Group();

  // 关键物理连接点位置 (局部坐标系)
  public readonly pinLocalPosition = new THREE.Vector3(0, 0.38, 0.04);

  // 3D 部件引用
  private baseMesh: THREE.Mesh;
  private rodMesh: THREE.Mesh;
  private clampGroup = new THREE.Group();
  private armMesh: THREE.Mesh;
  public pinMesh: THREE.Mesh;
  public snapAuraMesh: THREE.Mesh;
  public snapTargetGuide: THREE.Line;
  private plumbLine: THREE.Line;
  private plumbBobMesh: THREE.Mesh;
  private needleStandGroup = new THREE.Group();

  // 材质引用以支持高亮与清理
  private snapAuraMaterial: THREE.MeshBasicMaterial;
  private snapGuideMaterial: THREE.LineDashedMaterial;
  private plumbLineMaterial: THREE.LineBasicMaterial;

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
    const baseGeo = new THREE.BoxGeometry(0.24, 0.024, 0.18);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.35,
    });
    this.baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.baseMesh.position.set(-0.08, 0.012, -0.04);
    this.baseMesh.castShadow = true;
    this.baseMesh.receiveShadow = true;
    this.group.add(this.baseMesh);

    // 垂直镀铬不锈钢立柱
    const rodGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.52, 24);
    const rodMat = mechMetal(0xe2e8f0, 0.95, 0.12);
    this.rodMesh = new THREE.Mesh(rodGeo, rodMat);
    this.rodMesh.position.set(-0.14, 0.26, -0.08);
    this.rodMesh.castShadow = true;
    this.group.add(this.rodMesh);

    // 立柱顶部装饰安全球帽
    const capGeo = new THREE.SphereGeometry(0.011, 16, 16);
    const capMesh = new THREE.Mesh(capGeo, rodMat);
    capMesh.position.set(-0.14, 0.52, -0.08);
    this.group.add(capMesh);
  }

  /**
   * 2. 十字夹套 (Bosshead) 与悬臂横梁
   */
  private createClampAndArm(): void {
    const clampMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.30,
    });

    // 夹头主体
    const clampBody = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.032, 0.028), clampMat);
    this.clampGroup.add(clampBody);

    // 两个调节旋钮 (Thumbscrews)
    const screwGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.022, 16);
    const screwHeadGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 16);
    const screwMat = mechMetal(0xf59e0b, 0.9, 0.2); // 黄铜色旋钮

    const screw1 = new THREE.Mesh(screwGeo, screwMat);
    screw1.rotation.z = Math.PI / 2;
    screw1.position.set(-0.018, 0, 0);
    const screwHead1 = new THREE.Mesh(screwHeadGeo, screwMat);
    screwHead1.rotation.z = Math.PI / 2;
    screwHead1.position.set(-0.027, 0, 0);
    this.clampGroup.add(screw1, screwHead1);

    // 放置夹头在立柱上
    this.clampGroup.position.set(-0.14, 0.38, -0.08);
    this.group.add(this.clampGroup);

    // 水平横梁杆 (连接夹头并向前延伸)
    const armGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.20, 20);
    const armMat = mechMetal(0xe2e8f0, 0.95, 0.15);
    this.armMesh = new THREE.Mesh(armGeo, armMat);
    this.armMesh.rotation.x = Math.PI / 2;
    this.armMesh.position.set(-0.07, 0.38, -0.02);
    this.armMesh.rotation.z = -0.35;
    this.armMesh.castShadow = true;
    this.group.add(this.armMesh);
  }

  /**
   * 3. 悬挂横销与真实铅锤细线
   */
  private createSuspensionPinAndPlumb(): void {
    // 悬挂横销 (微上翘，防止薄板脱落)
    const pinGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.055, 16);
    const pinMat = mechMetal(0xffd700, 0.95, 0.15); // 金色
    this.pinMesh = new THREE.Mesh(pinGeo, pinMat);
    this.pinMesh.rotation.x = Math.PI / 2 - 0.08; // 微微上翘 4.5°
    this.pinMesh.position.copy(this.pinLocalPosition);
    this.pinMesh.name = 'suspension-pin';
    this.pinMesh.userData = { isSuspensionPin: true };
    this.group.add(this.pinMesh);

    // 悬挂横销吸附指引光环
    const auraGeo = new THREE.TorusGeometry(0.028, 0.003, 16, 32);
    this.snapAuraMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });
    this.snapAuraMesh = new THREE.Mesh(auraGeo, this.snapAuraMaterial);
    this.snapAuraMesh.position.copy(this.pinLocalPosition);
    this.snapAuraMesh.position.z += 0.006;
    this.group.add(this.snapAuraMesh);

    // 磁吸导引虚线 (连接横销与被拖拽孔)
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

    // 悬挂细线 (从销钉根部垂直向下悬垂)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(this.pinLocalPosition.x, this.pinLocalPosition.y, this.pinLocalPosition.z - 0.006),
      new THREE.Vector3(this.pinLocalPosition.x, this.pinLocalPosition.y - 0.28, this.pinLocalPosition.z - 0.006),
    ]);
    this.plumbLineMaterial = new THREE.LineBasicMaterial({
      color: 0xcfd8dc,
      linewidth: 2.0,
    });
    this.plumbLine = new THREE.Line(lineGeo, this.plumbLineMaterial);
    this.group.add(this.plumbLine);

    // 细线下端的黄铜铅锤 (Plumb Bob - 倒圆锥几何体)
    const bobGeo = new THREE.ConeGeometry(0.014, 0.038, 24);
    const bobMat = mechMetal(0xd97706, 0.92, 0.18); // 黄铜质感
    this.plumbBobMesh = new THREE.Mesh(bobGeo, bobMat);
    this.plumbBobMesh.rotation.x = Math.PI; // 尖端朝下
    this.plumbBobMesh.position.set(
      this.pinLocalPosition.x,
      this.pinLocalPosition.y - 0.28,
      this.pinLocalPosition.z - 0.006
    );
    this.group.add(this.plumbBobMesh);
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

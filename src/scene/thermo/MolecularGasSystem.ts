import * as THREE from 'three';

export interface VelocityHistogramData {
  bins: number[];
  binWidth: number;
  maxSpeed: number;
  vRmsTheoretical: number;
  vMostProbable: number;
  vMeanTheoretical: number;
}

export class MolecularGasSystem {
  public group: THREE.Group;
  private instancedMesh: THREE.InstancedMesh;
  private readonly particleCount = 400;
  private readonly particleRadius = 0.0036;

  // 粒子仿真状态
  private positions: Float32Array;
  private velocities: Float32Array;
  private speeds: Float32Array;
  private matrixArray: Float32Array;
  private scratchColor = new THREE.Color();

  // 圆柱形容器尺寸参数
  private readonly cylinderRadius = 0.076; // 内壁边界半径
  private readonly bottomY = 0.023;        // 气缸底板上表面高度
  private currentPistonY = 0.15;            // 动态活塞下底面高度

  // 热物理参数
  private currentTempK = 300;
  private currentMolarMassKg = 0.028; // 默认氮气 N2 = 0.028 kg/mol
  private readonly R_GAS = 8.314;     // 普适气体常数 J/(mol·K)

  // 仿真时间步长缩放因子
  private readonly timeScale = 0.00045;

  private disposables: { dispose: () => void }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'MolecularGasSystem';

    this.positions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);
    this.speeds = new Float32Array(this.particleCount);

    this.build();
    this.initializeParticles();
  }

  private build(): void {
    const sphereGeo = new THREE.SphereGeometry(this.particleRadius, 12, 12);
    const sphereMat = new THREE.MeshStandardMaterial({
      roughness: 0.2,
      metalness: 0.6,
      envMapIntensity: 1.0,
    });
    this.disposables.push(sphereGeo, sphereMat);

    this.instancedMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, this.particleCount);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.group.add(this.instancedMesh);
  }

  /**
   * 对每个分子坐标轴采样三维高斯速度分布，
   * 从而严格生成符合物理定律的麦克斯韦-玻尔兹曼速率分布。
   */
  private sampleGaussian(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  public initializeParticles(): void {
    const sigma = Math.sqrt((this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    this.matrixArray = this.instancedMesh.instanceMatrix.array as Float32Array;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const mIdx = i * 16;

      // 1. 在圆柱腔体内均匀随机分布位置
      const r = Math.sqrt(Math.random()) * (this.cylinderRadius - this.particleRadius);
      const theta = Math.random() * Math.PI * 2;
      this.positions[idx] = Math.cos(theta) * r;
      this.positions[idx + 1] = this.bottomY + Math.random() * (this.currentPistonY - this.bottomY);
      this.positions[idx + 2] = Math.sin(theta) * r;

      // 2. 采样麦克斯韦三维速度分量
      const vx = this.sampleGaussian() * sigma;
      const vy = this.sampleGaussian() * sigma;
      const vz = this.sampleGaussian() * sigma;

      this.velocities[idx] = vx;
      this.velocities[idx + 1] = vy;
      this.velocities[idx + 2] = vz;

      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      this.speeds[i] = speed;

      // 包含平移变换的 4x4 单位矩阵
      this.matrixArray[mIdx + 0] = 1;
      this.matrixArray[mIdx + 5] = 1;
      this.matrixArray[mIdx + 10] = 1;
      this.matrixArray[mIdx + 15] = 1;
      this.matrixArray[mIdx + 12] = this.positions[idx];
      this.matrixArray[mIdx + 13] = this.positions[idx + 1];
      this.matrixArray[mIdx + 14] = this.positions[idx + 2];
    }

    this.updateColors();
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 当温度或气体摩尔质量改变时平滑缩放现有粒子速度，
   * 保持麦克斯韦-玻尔兹曼热力学平衡态。
   */
  public updateThermodynamicState(tempK: number, molarMassKg: number, pistonY: number): void {
    const oldSigma = Math.sqrt((this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    this.currentTempK = Math.max(100, Math.min(800, tempK));
    this.currentMolarMassKg = Math.max(0.004, molarMassKg);
    this.currentPistonY = pistonY;

    const newSigma = Math.sqrt((this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    const ratio = newSigma / oldSigma;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      this.velocities[idx] *= ratio;
      this.velocities[idx + 1] *= ratio;
      this.velocities[idx + 2] *= ratio;
      this.speeds[i] = Math.hypot(this.velocities[idx], this.velocities[idx + 1], this.velocities[idx + 2]);
    }
    this.updateColors();
  }

  public update(delta: number, pistonY: number): void {
    this.currentPistonY = pistonY;
    const dt = Math.min(0.033, delta) * this.timeScale;
    const rBoundary = this.cylinderRadius - this.particleRadius;
    const yTop = this.currentPistonY - this.particleRadius;
    const yBottom = this.bottomY + this.particleRadius;
    const mArr = this.matrixArray;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const mIdx = i * 16;

      let x = this.positions[idx] + this.velocities[idx] * dt;
      let y = this.positions[idx + 1] + this.velocities[idx + 1] * dt;
      let z = this.positions[idx + 2] + this.velocities[idx + 2] * dt;

      // 1. 圆柱侧壁径向碰撞反弹
      const r = Math.hypot(x, z);
      if (r > rBoundary) {
        const nx = x / r;
        const nz = z / r;
        const vDotN = this.velocities[idx] * nx + this.velocities[idx + 2] * nz;
        if (vDotN > 0) {
          this.velocities[idx] -= 2 * vDotN * nx;
          this.velocities[idx + 2] -= 2 * vDotN * nz;
        }
        x = nx * rBoundary;
        z = nz * rBoundary;
      }

      // 2. 顶部活塞端面碰撞
      if (y > yTop) {
        y = yTop;
        if (this.velocities[idx + 1] > 0) {
          this.velocities[idx + 1] = -this.velocities[idx + 1];
        }
      }

      // 3. 底部托板碰撞
      if (y < yBottom) {
        y = yBottom;
        if (this.velocities[idx + 1] < 0) {
          this.velocities[idx + 1] = -this.velocities[idx + 1];
        }
      }

      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = z;

      mArr[mIdx + 12] = x;
      mArr[mIdx + 13] = y;
      mArr[mIdx + 14] = z;
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  private updateColors(): void {
    // 根据速率比值 v / v_rms 进行颜色映射：
    // v < 0.6 v_rms：深青色 / 冰蓝
    // 0.6 <= v < 1.2 v_rms：翡翠绿 / 浅绿
    // 1.2 <= v < 1.8 v_rms：琥珀黄 / 橙色
    // v >= 1.8 v_rms：炽热深红
    const vRms = Math.sqrt((3 * this.R_GAS * this.currentTempK) / this.currentMolarMassKg);

    for (let i = 0; i < this.particleCount; i++) {
      const ratio = this.speeds[i] / (vRms || 1);
      if (ratio < 0.6) {
        this.scratchColor.setRGB(0.0, 0.75, 1.0); // 青色
      } else if (ratio < 1.1) {
        this.scratchColor.setRGB(0.2, 0.88, 0.4); // 绿色
      } else if (ratio < 1.6) {
        this.scratchColor.setRGB(1.0, 0.72, 0.0); // 金黄色
      } else {
        this.scratchColor.setRGB(1.0, 0.22, 0.2); // 炽红色
      }
      this.instancedMesh.setColorAt(i, this.scratchColor);
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * 生成动态速率分布直方图数据及理论麦克斯韦-玻尔兹曼分布曲线值，
   * 供悬浮分析图表看板显示使用。
   */
  public getHistogramData(binCount = 20): VelocityHistogramData {
    const vRms = Math.sqrt((3 * this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    const vMostProbable = Math.sqrt((2 * this.R_GAS * this.currentTempK) / this.currentMolarMassKg);
    const vMean = Math.sqrt((8 * this.R_GAS * this.currentTempK) / (Math.PI * this.currentMolarMassKg));

    const maxSpeed = vRms * 2.8;
    const binWidth = maxSpeed / binCount;
    const invBinWidth = binWidth > 0 ? 1.0 / binWidth : 0;
    const bins = new Array<number>(binCount).fill(0);
    const speeds = this.speeds;
    const count = this.particleCount;

    for (let i = 0; i < count; i++) {
      const b = (speeds[i] * invBinWidth) | 0;
      if (b >= 0 && b < binCount) {
        bins[b]++;
      }
    }

    return {
      bins,
      binWidth,
      maxSpeed,
      vRmsTheoretical: vRms,
      vMostProbable,
      vMeanTheoretical: vMean,
    };
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}

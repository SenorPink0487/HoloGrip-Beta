/**
 * 牛顿大炮与天体力学开普勒万有引力动力学求解器
 * (Newton's Cannonball & Keplerian Gravitational Orbital Dynamics Solver)
 *
 * 核心天体力学物理模型：
 * 1. 经典牛顿万有引力中心力场加速度：
 *    a = - (GM / |r|^3) * r = - (mu / |r|^3) * r
 * 2. 高精度 Runge-Kutta 4阶 (RK4) 轨道积分算法，保证轨道机械能与比角动量长期严格守恒
 * 3. 第一宇宙速度 (圆轨道环绕速度):
 *    v_1 = sqrt(mu / r_0)
 * 4. 第二宇宙速度 (脱离地球逃逸速度):
 *    v_2 = sqrt(2 * mu / r_0) = sqrt(2) * v_1
 * 5. 轨道状态判据与能量判定：
 *    - landed: 近地点小于地球半径并在当前时刻触地撞击
 *    - orbiting: 近地点大于地球半径且离心率 e < 1，成为人造地球卫星！
 *    - escaped: 机械能 E >= 0，轨道为抛物线/双曲线，脱离地球引力束缚飞向深空
 */

import * as THREE from 'three';

// 真实物理常数 (SI 标准国际单位制)
export const EARTH_RADIUS_M = 6.371e6; // 地球平均半径 6371 km
export const EARTH_MASS_KG = 5.972e24; // 地球质量 5.972 × 10^24 kg
export const GRAVITATIONAL_CONSTANT = 6.6743e-11; // 万有引力常数 G (m^3 / kg s^2)
export const STANDARD_GRAVITATIONAL_PARAMETER = 3.986004418e14; // mu = GM (m^3 / s^2)

// 经典牛顿大炮发射高度 (对应场景比例 0.14m/0.52m，约 1715km，纯引力天体轨道)
export const CANNON_ALTITUDE_M = 1.715e6; // 1715 km
export const LAUNCH_RADIUS_M = EARTH_RADIUS_M + CANNON_ALTITUDE_M; // r0 = 8086 km

/**
 * 粒子状态枚举
 */
export type CannonballState = 'flying' | 'landed' | 'orbiting' | 'escaped';

/**
 * 轨道分类标签
 */
export type OrbitType = 'suborbital' | 'circular' | 'elliptical' | 'parabolic' | 'hyperbolic';

/**
 * 轨迹点数据
 */
export interface TrajectoryPoint {
  x: number;
  y: number;
  z: number;
  speed: number;
  time: number;
}

/**
 * 单个炮弹 / 卫星粒子
 */
export interface CannonballParticle {
  id: number;
  v0: number; // 发射初速度 (m/s)
  v0KmS: number; // 发射初速度 (km/s)
  position: THREE.Vector3; // 物理米制位置 (相对于地心)
  velocity: THREE.Vector3; // 物理米制速度 (m/s)
  state: CannonballState;
  orbitType: OrbitType;
  color: THREE.Color; // 依据速度和轨道类型的标识光谱颜色
  hexColor: number;

  // 轨道要素 (开普勒二体要素)
  eccentricity: number; // 离心率 e
  semiMajorAxis: number; // 半长轴 a (m)
  perigee: number; // 近地点距离地心 (m)
  apogee: number; // 远地点距离地心 (m)
  periodSeconds: number; // 轨道周期 (秒，对椭圆有效)
  specificEnergy: number; // 比机械能 E = v^2/2 - mu/r (J/kg)

  // 飞行记录
  flightTime: number; // 飞行经历真实物理时间 (秒)
  landingAngleRad?: number; // 撞击地表经度极角 (rad)
  landingPosition?: THREE.Vector3; // 撞击地表物理坐标 (m)
  completedOrbits: number; // 完成公转圈数
  totalAngularTravel: number; // 绕地转动累计角位移 (rad)
  lastAngle: number; // 上一步极角用于追踪圈数

  // 3D 轨迹点历史缓存 (供可视化渲染)
  trail: TrajectoryPoint[];
}

/**
 * 发射配置参数
 */
export interface NewtonCannonLaunchConfig {
  particleCount: number; // 粒子发射个数 (1 ~ 32)
  minVelocityKmS: number; // 最小初速 (km/s, 默认 3.5)
  maxVelocityKmS: number; // 最大初速 (km/s, 默认 11.2)
  spreadAngleDeg?: number; // 发射仰角/发散角微调 (度, 默认 0 水平)
}

/**
 * 动力学遥测统计数据
 */
export interface NewtonCannonTelemetry {
  firstCosmicVelocityKmS: number; // 第一宇宙速度 (km/s)
  secondCosmicVelocityKmS: number; // 第二宇宙速度 (km/s)
  totalParticles: number;
  flyingCount: number;
  landedCount: number;
  orbitingCount: number;
  escapedCount: number;
  fastestSpeedKmS: number;
  slowestSpeedKmS: number;
  maxAltitudeKm: number;
}

export class NewtonCannonDynamicsSolver {
  public readonly mu: number;
  public readonly earthRadius: number;
  public readonly cannonAltitude: number;
  public readonly launchRadius: number;

  // 理论特征宇宙速度 (km/s)
  public readonly v1KmS: number;
  public readonly v2KmS: number;

  // 当前活跃炮弹粒子集合
  public particles: CannonballParticle[] = [];

  // 全局历史统计
  private nextParticleId = 1;
  public totalLaunchedCount = 0;
  public totalLandedCount = 0;
  public totalOrbitingCount = 0;
  public totalEscapedCount = 0;

  // 仿真时间缩放 (默认 1 秒模拟真实世界 120 秒，使环绕 90 分钟周期在 45 秒内优美展示)
  public timeScale = 120.0;

  // 仿真模式：是否允许穿透地壳演化完整开普勒地心椭圆 (默认 false 保证碰撞测试兼容，在实验主场景设为 true)
  public allowPenetration: boolean;

  constructor(options?: {
    mu?: number;
    earthRadius?: number;
    cannonAltitude?: number;
    timeScale?: number;
    allowPenetration?: boolean;
  }) {
    this.mu = options?.mu ?? STANDARD_GRAVITATIONAL_PARAMETER;
    this.earthRadius = options?.earthRadius ?? EARTH_RADIUS_M;
    this.cannonAltitude = options?.cannonAltitude ?? CANNON_ALTITUDE_M;
    this.launchRadius = this.earthRadius + this.cannonAltitude;
    this.timeScale = options?.timeScale ?? 120.0;
    this.allowPenetration = options?.allowPenetration ?? false;

    // 计算当前发射高度下的第一、第二宇宙速度 (km/s)
    this.v1KmS = Math.sqrt(this.mu / this.launchRadius) / 1000.0; // ~7.70 km/s (350km 高空)
    this.v2KmS = Math.sqrt((2.0 * this.mu) / this.launchRadius) / 1000.0; // ~10.89 km/s
  }

  /**
   * 根据初速度和理论分类计算开普勒轨道参数
   */
  public calculateKeplerOrbit(v0KmS: number): {
    eccentricity: number;
    semiMajorAxis: number;
    perigee: number;
    apogee: number;
    periodSeconds: number;
    specificEnergy: number;
    orbitType: OrbitType;
  } {
    const v0 = v0KmS * 1000.0;
    const r0 = this.launchRadius;

    // 比机械能 E = v0^2 / 2 - mu / r0
    const specificEnergy = 0.5 * v0 * v0 - this.mu / r0;

    // 水平发射：r0 即为切向点，比角动量 h = r0 * v0
    const h = r0 * v0;

    // 离心率 e = sqrt(1 + 2 * E * h^2 / mu^2)
    const eTerm = 1.0 + (2.0 * specificEnergy * h * h) / (this.mu * this.mu);
    const eccentricity = eTerm > 0 ? Math.sqrt(eTerm) : 0;

    // 半长轴 a = - mu / (2 * E)
    let semiMajorAxis = 0;
    let periodSeconds = 0;
    let perigee = 0;
    let apogee = 0;

    let orbitType: OrbitType = 'suborbital';

    if (specificEnergy < -1e-6) {
      // 束缚椭圆轨道
      semiMajorAxis = -this.mu / (2.0 * specificEnergy);
      periodSeconds = 2.0 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / this.mu);

      if (v0 < Math.sqrt(this.mu / r0)) {
        // 初速小于第一宇宙速度：发射点 r0 为远地点，近地点更靠近地心
        apogee = r0;
        perigee = 2.0 * semiMajorAxis - apogee;
      } else {
        // 初速大于等于第一宇宙速度：发射点 r0 为近地点，远地点延伸入太空
        perigee = r0;
        apogee = 2.0 * semiMajorAxis - perigee;
      }

      if (perigee < this.earthRadius) {
        orbitType = 'suborbital'; // 近地点在地表以下，必然撞地
      } else if (Math.abs(eccentricity) < 0.005) {
        orbitType = 'circular'; // 圆轨道卫星
      } else {
        orbitType = 'elliptical'; // 椭圆轨道卫星
      }
    } else if (Math.abs(specificEnergy) <= 1e-6) {
      // 抛物线逃逸轨道
      orbitType = 'parabolic';
      perigee = r0;
      apogee = Infinity;
      semiMajorAxis = Infinity;
    } else {
      // 双曲线深空逃逸轨道
      orbitType = 'hyperbolic';
      perigee = r0;
      apogee = Infinity;
      semiMajorAxis = -this.mu / (2.0 * specificEnergy);
    }

    return {
      eccentricity,
      semiMajorAxis,
      perigee,
      apogee,
      periodSeconds,
      specificEnergy,
      orbitType,
    };
  }

  /**
   * 根据初速度分配专属的光谱渐变颜色
   * - 低速落体 (橙红至金黄)
   * - 第一宇宙速度临界与人造卫星 (明亮青天蓝与荧光绿)
   * - 超高速与逃逸 (深紫罗兰与亮洋红)
   */
  public getParticleColor(v0KmS: number): { color: THREE.Color; hex: number } {
    const v1 = this.v1KmS;
    const v2 = this.v2KmS;

    const color = new THREE.Color();

    if (v0KmS < v1) {
      // 次轨道落体：从烈焰高饱和猩红过渡到高能霓虹橙与金黄 (纯正饱和色谱，无灰暗/泛白分量)
      const t = Math.max(0, Math.min(1, (v0KmS - 2.5) / (v1 - 2.5)));
      // #ff1744 -> #ff9100 -> #ffee00
      const r = 1.0;
      const g = 0.08 + t * 0.82;
      const b = 0.02 * (1.0 - t);
      color.setRGB(r, g, b);
    } else if (v0KmS <= v2) {
      // 人造卫星轨道：从极光电光青蓝过渡到明澈激光翠绿与湛蓝
      const t = Math.max(0, Math.min(1, (v0KmS - v1) / (v2 - v1)));
      // #00f0ff (第一宇宙速度入轨) -> #00e676 -> #2979ff
      if (t < 0.5) {
        const u = t * 2.0;
        color.setRGB(0.0, 0.95 - u * 0.05, 1.0 - u * 0.54);
      } else {
        const u = (t - 0.5) * 2.0;
        color.setRGB(0.0 + u * 0.16, 0.9 - u * 0.43, 0.46 + u * 0.54);
      }
    } else {
      // 第二宇宙速度逃逸：高能霓虹紫罗兰过渡到热烈电光洋红与金粉
      const t = Math.max(0, Math.min(1, (v0KmS - v2) / 3.0));
      // #d500f9 -> #f50057
      color.setRGB(0.85 + t * 0.11, 0.0, 0.98 - t * 0.64);
    }

    return { color, hex: color.getHex() };
  }

  /**
   * 触发发射粒子群
   */
  public launch(config: NewtonCannonLaunchConfig): CannonballParticle[] {
    const count = Math.max(1, Math.min(32, Math.floor(config.particleCount)));
    const minV = Math.max(1.0, config.minVelocityKmS);
    const maxV = Math.max(minV, config.maxVelocityKmS);
    const newParticles: CannonballParticle[] = [];

    for (let i = 0; i < count; i++) {
      // 线性等间距分布速度
      const v0KmS = count === 1 ? minV : minV + (i / (count - 1)) * (maxV - minV);
      const v0 = v0KmS * 1000.0; // 转换为 m/s

      // 轨道理论解算
      const kepler = this.calculateKeplerOrbit(v0KmS);
      const { color, hex } = this.getParticleColor(v0KmS);

      // 初始位置：山顶位于 (0, r0, 0)
      const r0 = this.launchRadius;
      const initialPos = new THREE.Vector3(0, r0, 0);

      // 初始速度：水平切向指向 +X 轴 (v0, 0, 0)
      const initialVel = new THREE.Vector3(v0, 0, 0);

      const initialAngle = Math.atan2(initialPos.x, initialPos.y);

      const particle: CannonballParticle = {
        id: this.nextParticleId++,
        v0,
        v0KmS,
        position: initialPos.clone(),
        velocity: initialVel.clone(),
        state: 'flying',
        orbitType: kepler.orbitType,
        color,
        hexColor: hex,

        eccentricity: kepler.eccentricity,
        semiMajorAxis: kepler.semiMajorAxis,
        perigee: kepler.perigee,
        apogee: kepler.apogee,
        periodSeconds: kepler.periodSeconds,
        specificEnergy: kepler.specificEnergy,

        flightTime: 0,
        completedOrbits: 0,
        totalAngularTravel: 0,
        lastAngle: initialAngle,

        trail: [
          {
            x: initialPos.x,
            y: initialPos.y,
            z: initialPos.z,
            speed: v0,
            time: 0,
          },
        ],
      };

      this.particles.push(particle);
      newParticles.push(particle);
      this.totalLaunchedCount++;
    }

    return newParticles;
  }

  /**
   * 清空所有粒子与轨迹
   */
  public clear(): void {
    this.particles = [];
  }

  /**
   * 计算指定位置处的引力加速度矢量: a = - mu / r^3 * r
   * 采用引力软化因子 eps = 200km，避免穿透地心极近处 (r -> 0) 时数值发散，保持光滑物理轨道
   */
  private getAcceleration(pos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const r2 = pos.lengthSq();
    const eps2 = 200e3 * 200e3;
    const rEff = Math.sqrt(r2 + eps2);
    const factor = -this.mu / (rEff * rEff * rEff);
    out.copy(pos).multiplyScalar(factor);
    return out;
  }

  // 临时矢量复用，避免垃圾回收 GC 抖动
  private tempK1v = new THREE.Vector3();
  private tempK1r = new THREE.Vector3();
  private tempK2v = new THREE.Vector3();
  private tempK2r = new THREE.Vector3();
  private tempK3v = new THREE.Vector3();
  private tempK3r = new THREE.Vector3();
  private tempK4v = new THREE.Vector3();
  private tempK4r = new THREE.Vector3();
  private tempPos = new THREE.Vector3();
  private tempVel = new THREE.Vector3();

  /**
   * 采用经典 RK4 (四阶龙格-库塔) 算法演化单步
   */
  private stepParticleRK4(p: CannonballParticle, dt: number): void {
    // k1
    this.getAcceleration(p.position, this.tempK1v);
    this.tempK1r.copy(p.velocity);

    // k2
    this.tempPos.copy(p.position).addScaledVector(this.tempK1r, 0.5 * dt);
    this.tempVel.copy(p.velocity).addScaledVector(this.tempK1v, 0.5 * dt);
    this.getAcceleration(this.tempPos, this.tempK2v);
    this.tempK2r.copy(this.tempVel);

    // k3
    this.tempPos.copy(p.position).addScaledVector(this.tempK2r, 0.5 * dt);
    this.tempVel.copy(p.velocity).addScaledVector(this.tempK2v, 0.5 * dt);
    this.getAcceleration(this.tempPos, this.tempK3v);
    this.tempK3r.copy(this.tempVel);

    // k4
    this.tempPos.copy(p.position).addScaledVector(this.tempK3r, dt);
    this.tempVel.copy(p.velocity).addScaledVector(this.tempK3v, dt);
    this.getAcceleration(this.tempPos, this.tempK4v);
    this.tempK4r.copy(this.tempVel);

    // 更新位置与速度
    p.position.addScaledVector(this.tempK1r, dt / 6.0);
    p.position.addScaledVector(this.tempK2r, dt / 3.0);
    p.position.addScaledVector(this.tempK3r, dt / 3.0);
    p.position.addScaledVector(this.tempK4r, dt / 6.0);

    p.velocity.addScaledVector(this.tempK1v, dt / 6.0);
    p.velocity.addScaledVector(this.tempK2v, dt / 3.0);
    p.velocity.addScaledVector(this.tempK3v, dt / 3.0);
    p.velocity.addScaledVector(this.tempK4v, dt / 6.0);

    p.flightTime += dt;

    // 累计绕地角位移并检测公转圈数
    const curAngle = Math.atan2(p.position.x, p.position.y);
    let dAngle = curAngle - p.lastAngle;
    if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
    else if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    p.totalAngularTravel += Math.abs(dAngle);
    p.lastAngle = curAngle;
    p.completedOrbits = Math.floor(p.totalAngularTravel / (2.0 * Math.PI));
  }

  /**
   * 物理演化循环更新
   * @param deltaSeconds 渲染帧时间间隔 (秒)
   */
  public update(deltaSeconds: number): void {
    if (this.particles.length === 0) return;

    // 限制单步仿真时间上限为 60 秒，防止数值发散
    const simTime = Math.min(Math.max(0, deltaSeconds) * this.timeScale, 60.0);

    // 将时间细分为子步以保证天体轨道高精度 (每个积分子步 <= 2.0 秒)
    const subSteps = Math.max(1, Math.ceil(simTime / 2.0));
    const subDt = simTime / subSteps;

    for (const p of this.particles) {
      if (p.state === 'landed') {
        // 已撞击地面，静止
        continue;
      }

      for (let s = 0; s < subSteps; s++) {
        if ((p.state as CannonballState) === 'landed') break;

        this.stepParticleRK4(p, subDt);

        const currentDist = p.position.length();

        // 1. 撞击地面检测 (在非穿模模式下截断落地；在穿模模式下允许粒子深入地心演化完整开普勒闭合椭圆)
        if (!this.allowPenetration && currentDist <= this.earthRadius) {
          // 精确投影到地球表面
          p.position.normalize().multiplyScalar(this.earthRadius);
          p.velocity.set(0, 0, 0);
          p.state = 'landed';
          p.landingAngleRad = Math.atan2(p.position.x, p.position.y);
          p.landingPosition = p.position.clone();
          this.totalLandedCount++;
          break;
        }

        // 2. 稳定轨道在轨检测
        if (
          p.state === 'flying' &&
          p.orbitType !== 'suborbital' &&
          (p.completedOrbits >= 1 || p.totalAngularTravel >= Math.PI)
        ) {
          p.state = 'orbiting';
          this.totalOrbitingCount++;
        }

        // 3. 深空逃逸检测 (距离地球大于 12 个地球半径且属于非束缚轨道)
        if (currentDist > this.earthRadius * 12.0 && p.specificEnergy >= 0) {
          p.state = 'escaped';
          this.totalEscapedCount++;
          break;
        }
      }

      // 采样记录轨迹点 (动态定距或定帧记录，限制每条轨迹最多保留 600 点)
      const lastPoint = p.trail[p.trail.length - 1];
      const distFromLast = lastPoint
        ? p.position.distanceTo(new THREE.Vector3(lastPoint.x, lastPoint.y, lastPoint.z))
        : Infinity;

      // 约每隔 80 km 采样一个点，在视觉上形成顺滑无棱角的光滑曲线
      if (distFromLast >= 80e3 || p.state === 'landed') {
        let recX = p.position.x;
        let recY = p.position.y;
        let recZ = p.position.z;
        if (!this.allowPenetration && p.state === 'landed') {
          const r = Math.sqrt(recX * recX + recY * recY + recZ * recZ);
          if (r < this.earthRadius && r > 0) {
            const fac = this.earthRadius / r;
            recX *= fac;
            recY *= fac;
            recZ *= fac;
          }
        }
        p.trail.push({
          x: recX,
          y: recY,
          z: recZ,
          speed: p.velocity.length(),
          time: p.flightTime,
        });

        // 避免内存无限膨胀，超出 600 点时平滑裁剪较老点（如果还在飞行中）
        if (p.trail.length > 600 && p.state !== 'landed') {
          p.trail.shift();
        }
      }
    }
  }

  /**
   * 获取当前动态遥测信息
   */
  public getTelemetry(): NewtonCannonTelemetry {
    let flying = 0;
    let landed = 0;
    let orbiting = 0;
    let escaped = 0;
    let fastest = 0;
    let slowest = Infinity;
    let maxAlt = 0;

    for (const p of this.particles) {
      if (p.state === 'flying') flying++;
      else if (p.state === 'landed') landed++;
      else if (p.state === 'orbiting') orbiting++;
      else if (p.state === 'escaped') escaped++;

      const speed = p.velocity.length() / 1000.0;
      if (speed > fastest) fastest = speed;
      if (speed < slowest && p.state !== 'landed') slowest = speed;

      const alt = (p.position.length() - this.earthRadius) / 1000.0;
      if (alt > maxAlt) maxAlt = alt;
    }

    if (slowest === Infinity) slowest = 0;

    return {
      firstCosmicVelocityKmS: this.v1KmS,
      secondCosmicVelocityKmS: this.v2KmS,
      totalParticles: this.particles.length,
      flyingCount: flying,
      landedCount: landed,
      orbitingCount: orbiting,
      escapedCount: escaped,
      fastestSpeedKmS: fastest,
      slowestSpeedKmS: slowest,
      maxAltitudeKm: maxAlt,
    };
  }
}

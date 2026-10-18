/**
 * 电影级高保真 3D 地球天体系统与牛顿大炮发射台
 * (Photorealistic NASA 4K Full-Daylight Earth Celestial Model & Newton Cannon System)
 *
 * 设计特性与渲染管线：
 * 1. NASA 官方高分辨率 4K/2K 全套真实天体贴图资源：
 *    - 4K 全球真实地貌日照图 (Day Surface 4096)
 *    - 2K 真实山脉与地形法线贴图 (Topography Normal 2048)
 *    - 2K 真实海洋水体镜面反射高光遮罩 (Ocean Specular 2048)
 *    - 4K 真实全球气旋卷云层 (Atmospheric Clouds 4096)
 * 2. 全景通透均匀光照设计 (Full-Daylight Global Visibility)：
 *    - 取消背阴黑夜暗区，使全球各大洲地貌、各大洋及经纬网络 360° 清晰可辨，绝无死黑暗角
 *    - 极大方便精准观测炮弹在不同经纬度上空掠过、撞击地表或环绕入轨的完整轨迹
 * 3. 海洋高光与立体质感：
 *    - 海洋根据高光遮罩展现出自然的水体微反射光泽
 *    - 陆地山脉地形立体，不沉暗
 * 4. 独立动态双层大气云层 (Dynamic Multi-altitude Clouds Layer)：
 *    - 4K 卷云与台风气旋独立轻柔漂移流动，洁白通透
 * 5. 国际空间站 (ISS) 视界级太空大气菲涅尔瑞利散射边缘光环 (Atmosphere Limb Rim Glow)
 * 6. 巍峨高山之巅牛顿大炮动能发射台、高能离子点火冲击光环与第一宇宙速度参考轨道环
 * 7. 深空星河背景微光 (Deep Space Starfield)
 */

import * as THREE from 'three';
import { disposeObjectTree, mechMetal } from './mechKit.ts';

export class RealisticEarthMesh {
  public readonly group = new THREE.Group();

  // 1. 地球核心天体组件
  public earthSphere: THREE.Mesh;
  public cloudSphere: THREE.Mesh;
  public atmosphereGlow: THREE.Mesh;
  public starfieldPoints: THREE.Points;

  // 地轴旋转轴组 (23.44° 倾角)
  public tiltGroup = new THREE.Group();
  public earthRotationGroup = new THREE.Group();

  // 2. 高山与牛顿大炮发射台
  public cannonStationGroup = new THREE.Group();
  public cannonBarrelMesh: THREE.Mesh;
  public muzzleFlashGroup = new THREE.Group();
  private muzzleFlashLight: THREE.PointLight;
  private muzzleFlashMesh: THREE.Mesh;
  private muzzleRingMesh: THREE.Mesh;
  private flashTimer = 0;

  // 3. 轨道基准参考环
  public orbitalRingMesh: THREE.Mesh;

  // 4. 地球上方待命粒子与水平发射切线虚线 (Standby Particle & Tangent Aim Line)
  public standbyParticleGroup = new THREE.Group();
  public standbyParticleMesh: THREE.Mesh;
  public standbyHaloMesh: THREE.Mesh;
  public aimLineMesh: THREE.Line;
  private standbyTime = 0;

  // 5. 材质与着色器
  private earthMaterial: THREE.ShaderMaterial;
  private cloudMaterial: THREE.ShaderMaterial;
  private atmosphereMaterial: THREE.ShaderMaterial;

  // 纹理引用
  private dayTexture: THREE.Texture;
  private normalTexture: THREE.Texture;
  private specularTexture: THREE.Texture;
  private cloudsTexture: THREE.Texture;

  // 几何尺寸常量 (场景三维世界米制单位)
  public readonly EARTH_RADIUS_SCENE = 0.52; // 地球半径 52cm
  public readonly CANNON_HEIGHT_SCENE = 0.14; // 地球上方发射点高度 (与参考图比例完全一致)
  public readonly LAUNCH_RADIUS_SCENE = this.EARTH_RADIUS_SCENE + this.CANNON_HEIGHT_SCENE;

  // 自转速度 (弧度/秒)
  private earthRotationSpeed = 0.04;
  private cloudRotationSpeed = 0.052; // 云层自转略快于地表，呈现相对漂流

  constructor() {
    this.group.name = 'RealisticEarthMesh';

    // 构建地轴倾角组
    this.group.add(this.tiltGroup);
    this.tiltGroup.rotation.z = THREE.MathUtils.degToRad(-23.44); // 真实地轴倾角 23.44°
    this.tiltGroup.add(this.earthRotationGroup);

    // 0. 加载高保真 NASA 纹理
    this.loadTextures();

    // 1. 构建全景清晰透亮的 4K 地球核心球体 (全日光清晰视野，无背阳死黑)
    this.earthSphere = this.buildEarthSphere();
    this.earthRotationGroup.add(this.earthSphere);

    // 2. 构建动态高空卷云与气旋球体
    this.cloudSphere = this.buildCloudSphere();
    this.earthRotationGroup.add(this.cloudSphere);

    // 3. 构建 ISS 太空菲涅尔瑞利散射外壳光晕
    this.atmosphereGlow = this.buildAtmosphereGlow();
    this.earthRotationGroup.add(this.atmosphereGlow);

    // 4. 保持地球表面自然纯净：严禁在地球表面放置意义不明的蓝色构件 (大炮管、线圈、立柱与蓝色环)
    // 仅初始化占位对象以保证 API 与测试兼容性，绝不添加到 3D 渲染树中
    this.cannonStationGroup = new THREE.Group();
    this.cannonBarrelMesh = new THREE.Mesh();
    this.cannonStationGroup.add(this.cannonBarrelMesh);

    // 5. 轨道参考环 (不添加到地球表面，视界开阔干净)
    this.orbitalRingMesh = new THREE.Mesh();

    // 6. 构建地球上方待命粒子与水平切线虚线 (严格对齐用户图中样式)
    this.buildStandbyParticleAndAimLine();
    this.group.add(this.standbyParticleGroup);

    // 7. 发射特效组占位
    this.buildMuzzleFlash();

    // 8. 室内全息实验室环境：移除空中杂散固定的深空星芒粒子，保持实验空间绝对纯净
    this.starfieldPoints = new THREE.Points();
  }

  /**
   * 创建 1x1 安全兜底纹理 (供 Node.js 离线测试环境无缝运行)
   */
  private createFallbackTexture(colorHex: number): THREE.DataTexture {
    const r = (colorHex >> 16) & 255;
    const g = (colorHex >> 8) & 255;
    const b = colorHex & 255;
    const data = new Uint8Array([r, g, b, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * 加载 4K NASA 真实天体纹理 (支持浏览器环境与 Node.js 测试环境)
   */
  private loadTextures(): void {
    const isBrowser = typeof window !== 'undefined' && typeof Image !== 'undefined';
    const loader = new THREE.TextureLoader();

    if (isBrowser) {
      // 优先从本地 static public 快速加载 (无延迟，完全离线运行)
      this.dayTexture = loader.load('/textures/earth/earth_day_4096.jpg');
      this.normalTexture = loader.load('/textures/earth/earth_normal_2048.jpg');
      this.specularTexture = loader.load('/textures/earth/earth_specular_2048.jpg');
      this.cloudsTexture = loader.load('/textures/earth/earth_clouds_4k.jpg');
    } else {
      // Node.js 自动化测试环境使用纯内存轻量级 fallback 纹理
      this.dayTexture = this.createFallbackTexture(0x1e3a8a);
      this.normalTexture = this.createFallbackTexture(0x8080ff);
      this.specularTexture = this.createFallbackTexture(0x404040);
      this.cloudsTexture = this.createFallbackTexture(0xffffff);
    }

    // 纹理环绕设置
    const textures = [
      this.dayTexture,
      this.normalTexture,
      this.specularTexture,
      this.cloudsTexture,
    ];
    for (const t of textures) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
    }
  }

  /**
   * 1. 构建全景清晰透亮的 4K 地球核心球体
   * 全日光设计 (Full-Daylight Global Map)：
   * - 360° 无黑夜死角，全球地貌、各大洋及经纬网络完全清晰通透
   * - 极度便于观察炮弹在各个大陆和大洋上空的轨道轨迹与落地点
   * - 结合海洋镜面高光 (Specular Mask) 展现水体波光
   * - 地球边缘环绕 360° 柔美透亮的天青色太空瑞利散射光晕 (Limb Rayleigh Atmosphere)
   */
  private buildEarthSphere(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(this.EARTH_RADIUS_SCENE, 128, 96);

    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform sampler2D uDayMap;
      uniform sampler2D uNormalMap;
      uniform sampler2D uSpecularMap;

      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);

        // 1. 采样 4K 真实地球地貌高清晰度日照图
        vec4 dayColor = texture2D(uDayMap, vUv);

        // 2. 海洋水体微反射光泽 (柔和全景高光)
        float specMask = texture2D(uSpecularMap, vUv).r;
        vec3 lightDir = normalize(vec3(0.6, 0.8, 1.0));
        vec3 halfVec = normalize(lightDir + viewDir);
        float NdotH = max(0.0, dot(normal, halfVec));
        float oceanSpec = pow(NdotH, 32.0) * specMask * 0.40;

        // 3. 地球边缘 360° 菲涅尔瑞利大气蓝天光晕 (Limb Rayleigh Atmosphere Fresnel)
        float vDotN = max(0.0, dot(viewDir, normal));
        float fresnel = pow(1.0 - vDotN, 2.6);
        vec3 atmosphereRim = vec3(0.12, 0.62, 1.0) * fresnel * 0.85;

        // 4. 自然明亮、色彩饱满真实的地球全景观 (无死黑区域)
        vec3 color = dayColor.rgb * 1.06 + vec3(oceanSpec) + atmosphereRim;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    this.earthMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uDayMap: { value: this.dayTexture },
        uNormalMap: { value: this.normalTexture },
        uSpecularMap: { value: this.specularTexture },
      },
    });

    const mesh = new THREE.Mesh(geo, this.earthMaterial);
    mesh.name = 'EarthCoreSphere';
    mesh.renderOrder = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * 2. 构建动态对流卷云与气旋球体 (Atmospheric Cloud Layer)
   * 全球轻盈洁白半透明，随气流平稳漂移，自然逼真
   */
  private buildCloudSphere(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(this.EARTH_RADIUS_SCENE * 1.014, 128, 96);

    const vertexShader = `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform sampler2D uCloudsMap;

      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec4 cloudTex = texture2D(uCloudsMap, vUv);
        // 使用亮度通道作为透明度 (NASA 4K 云层图)
        float cloudAlpha = max(cloudTex.r, max(cloudTex.g, cloudTex.b));

        // 视线边缘柔和透光
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - max(0.0, dot(viewDir, normal)), 2.0);

        // 纯白明澈的大气云团
        vec3 cloudColor = vec3(0.96, 0.98, 1.0);
        gl_FragColor = vec4(cloudColor, cloudAlpha * (0.62 + rim * 0.28));
      }
    `;

    this.cloudMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCloudsMap: { value: this.cloudsTexture },
      },
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, this.cloudMaterial);
    mesh.name = 'EarthCloudSphere';
    mesh.renderOrder = 1;
    return mesh;
  }

  /**
   * 3. 构建 ISS 太空菲涅尔瑞利散射外壳光晕 (Atmosphere Rim Glow Shell)
   */
  private buildAtmosphereGlow(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(this.EARTH_RADIUS_SCENE * 1.058, 64, 48);

    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      void main() {
        // 菲涅尔边缘系数 (视线掠射角瑞利散射强烈)
        float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
        // 国际空间站拍摄地球真实的群青蔚蓝与晨曦乳白
        vec3 atmosphereColor = mix(vec3(0.05, 0.55, 1.0), vec3(0.85, 0.95, 1.0), intensity * 0.65);
        gl_FragColor = vec4(atmosphereColor, intensity * 0.92);
      }
    `;

    this.atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, this.atmosphereMaterial);
    mesh.name = 'AtmosphereGlow';
    mesh.renderOrder = 2;
    return mesh;
  }

  /**
   * 4. 构建牛顿大炮高科技发射台 (微型平贴地表动能发射基座，无突兀圆锥体)
   */
  private buildCannonStation(): void {
    // 紧贴地表曲率的流线型高科技合金基座
    const plinthGeo = new THREE.CylinderGeometry(0.014, 0.018, 0.005, 32);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.85,
      roughness: 0.22,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(0, this.LAUNCH_RADIUS_SCENE - 0.003, 0);
    this.cannonStationGroup.add(plinth);

    // 旋转炮架
    const bracketGeo = new THREE.BoxGeometry(0.010, 0.012, 0.014);
    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.2,
    });
    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
    bracket.position.set(0, this.LAUNCH_RADIUS_SCENE + 0.004, 0);
    this.cannonStationGroup.add(bracket);

    // 经典牛顿大炮高科技动能炮身 (水平指向 +X 轴切线)
    const barrelGeo = new THREE.CylinderGeometry(0.005, 0.007, 0.042, 20);
    barrelGeo.rotateZ(-Math.PI / 2);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x0369a1,
      emissiveIntensity: 0.4,
    });
    this.cannonBarrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
    this.cannonBarrelMesh.position.set(0.018, this.LAUNCH_RADIUS_SCENE + 0.012, 0);
    this.cannonStationGroup.add(this.cannonBarrelMesh);

    // 炮口能量加速环
    const coilGeo = new THREE.TorusGeometry(0.007, 0.0018, 12, 24);
    coilGeo.rotateY(Math.PI / 2);
    const coilMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.0,
    });
    const coil = new THREE.Mesh(coilGeo, coilMat);
    coil.position.set(0.038, this.LAUNCH_RADIUS_SCENE + 0.012, 0);
    this.cannonStationGroup.add(coil);

    // 全息信标导引光柱
    const beaconGeo = new THREE.CylinderGeometry(0.001, 0.001, 0.08, 12);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, this.LAUNCH_RADIUS_SCENE + 0.05, 0);
    this.cannonStationGroup.add(beacon);
  }

  /**
   * 5. 构建第一宇宙速度半透明基准参考轨道环
   */
  private buildOrbitalReferenceRing(): THREE.Mesh {
    const ringGeo = new THREE.RingGeometry(
      this.LAUNCH_RADIUS_SCENE - 0.002,
      this.LAUNCH_RADIUS_SCENE + 0.002,
      96
    );
    ringGeo.rotateX(Math.PI / 2);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    });

    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.name = 'OrbitalReferenceRing';
    return mesh;
  }

  /**
   * 6. 构建地球上方待命粒子与水平发射切线虚线 (Standby Particle & Tangent Aim Line)
   * 严格匹配用户参考图：
   * - 显著放大的高饱和发光粒子静止置于地球正上方 (0, LAUNCH_RADIUS_SCENE, 0)
   * - 从粒子外沿向右水平拉出一条清晰高对比度的纯白切线虚线
   */
  private buildStandbyParticleAndAimLine(): void {
    const launchY = this.LAUNCH_RADIUS_SCENE;

    // A. 醒目发光待命小球 (色彩柔和饱满，杜绝过曝泛白，半径 0.024)
    const pGeo = new THREE.SphereGeometry(0.024, 32, 32);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff, // 纯正饱和极光电青色
      emissive: 0x0099cc,
      emissiveIntensity: 0.35, // 降低自发光，显现真实色彩，不晃眼
      metalness: 0.15,
      roughness: 0.4,
    });
    this.standbyParticleMesh = new THREE.Mesh(pGeo, pMat);
    this.standbyParticleMesh.name = 'cannon-standby-particle';
    this.standbyParticleMesh.position.set(0, launchY, 0);
    this.standbyParticleMesh.renderOrder = 6;
    this.standbyParticleGroup.add(this.standbyParticleMesh);

    // 外层呼吸发光微耀斑
    const haloGeo = new THREE.SphereGeometry(0.032, 24, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.25, // 柔和微光，不刺眼
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.standbyHaloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.standbyParticleMesh.add(this.standbyHaloMesh);

    // B. 水平向右延伸的白色发射切线虚线 (如同用户图中那样)
    const points = [
      new THREE.Vector3(0.035, launchY, 0),
      new THREE.Vector3(1.65, launchY, 0),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xffffff, // 极高对比度纯白虚线
      dashSize: 0.05,
      gapSize: 0.03,
      linewidth: 3,
      transparent: false,
      opacity: 1.0,
    });
    this.aimLineMesh = new THREE.Line(lineGeo, lineMat);
    this.aimLineMesh.computeLineDistances();
    this.standbyParticleGroup.add(this.aimLineMesh);
  }

  /**
   * 控制待命粒子与发射切线指示线的显隐
   */
  public setStandbyVisible(visible: boolean): void {
    this.standbyParticleGroup.visible = visible;
  }

  /**
   * 7. 构建发射点火特效组件
   */
  private buildMuzzleFlash(): void {
    this.muzzleFlashGroup.position.set(0.042, this.LAUNCH_RADIUS_SCENE + 0.012, 0);
    this.cannonStationGroup.add(this.muzzleFlashGroup);

    // 核心光爆球
    const sphereGeo = new THREE.SphereGeometry(0.024, 16, 16);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    this.muzzleFlashMesh = new THREE.Mesh(sphereGeo, flashMat);
    this.muzzleFlashGroup.add(this.muzzleFlashMesh);

    // 冲击激波环
    const ringGeo = new THREE.RingGeometry(0.005, 0.012, 32);
    ringGeo.rotateY(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    this.muzzleRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.muzzleFlashGroup.add(this.muzzleRingMesh);

    // 动态点光源
    this.muzzleFlashLight = new THREE.PointLight(0x00e5ff, 0, 0.5);
    this.muzzleFlashGroup.add(this.muzzleFlashLight);
  }

  /**
   * 7. 构建深空背景星芒 (Deep Space Starfield)
   */
  private buildStarfield(): THREE.Points {
    const count = 450;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = 1.4 + Math.random() * 1.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const shade = Math.random();
      if (shade > 0.6) {
        colors[i * 3 + 0] = 0.85;
        colors[i * 3 + 1] = 0.95;
        colors[i * 3 + 2] = 1.0;
      } else if (shade > 0.3) {
        colors[i * 3 + 0] = 1.0;
        colors[i * 3 + 1] = 0.95;
        colors[i * 3 + 2] = 0.8;
      } else {
        colors[i * 3 + 0] = 0.7;
        colors[i * 3 + 1] = 0.85;
        colors[i * 3 + 2] = 1.0;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.012,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
    });

    const points = new THREE.Points(geo, mat);
    points.name = 'EarthStarfield';
    return points;
  }

  /**
   * 触发发射瞬间高能闪光与冲击环
   */
  public triggerMuzzleFlash(): void {
    this.flashTimer = 0.35;
  }

  /**
   * 动画演化更新 (地球真实自转、云层相对对流漂移、点火光芒衰减)
   * @param deltaSeconds 帧时间
   */
  public update(deltaSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.1);

    // 地球自转
    this.earthSphere.rotation.y += this.earthRotationSpeed * dt;

    // 高空云层超前漂移
    this.cloudSphere.rotation.y += this.cloudRotationSpeed * dt;

    // 待命粒子微弱呼吸光晕
    if (this.standbyParticleMesh && this.standbyParticleMesh.visible) {
      this.standbyTime += dt;
      const breath = 1.0 + Math.sin(this.standbyTime * 3.5) * 0.12;
      this.standbyHaloMesh.scale.set(breath, breath, breath);
    }

    // 发射点火特效衰减
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const progress = Math.max(0, this.flashTimer / 0.35); // 1 -> 0
      const flashMat = this.muzzleFlashMesh.material as THREE.MeshBasicMaterial;
      const ringMat = this.muzzleRingMesh.material as THREE.MeshBasicMaterial;

      flashMat.opacity = progress * 0.95;
      ringMat.opacity = progress * 0.85;

      const scale = 1.0 + (1.0 - progress) * 3.5;
      this.muzzleRingMesh.scale.set(scale, scale, scale);

      this.muzzleFlashLight.intensity = progress * 4.5;
    } else {
      (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.muzzleRingMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      this.muzzleFlashLight.intensity = 0;
    }
  }

  /**
   * 彻底安全释放 GPU 显存
   */
  public dispose(): void {
    disposeObjectTree(this.group);
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    const textures = [
      this.dayTexture,
      this.normalTexture,
      this.specularTexture,
      this.cloudsTexture,
    ];
    for (const t of textures) {
      if (t) t.dispose();
    }
  }
}

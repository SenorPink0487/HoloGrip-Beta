import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { ThermostatHeaterMesh } from '../../../scene/thermo/ThermostatHeaterMesh.ts';
import { PistonCylinderMesh } from '../../../scene/thermo/PistonCylinderMesh.ts';
import { PressureGaugeMesh } from '../../../scene/thermo/PressureGaugeMesh.ts';
import { MolecularGasSystem } from '../../../scene/thermo/MolecularGasSystem.ts';
import { ThermoInteractionManager } from '../../../scene/thermo/ThermoInteractionManager.ts';
import type { ThermoTelemetryData } from '../../../ui/vision/ThermoStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class ThermoIdealGasExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  // 3D 场景组件
  private heater: ThermostatHeaterMesh;
  private cylinder: PistonCylinderMesh;
  private pressureGauge: PressureGaugeMesh;
  private molecularGas: MolecularGasSystem;
  private interactionManager: ThermoInteractionManager;

  // 连接导气铜管网格
  private connectPipe: THREE.Mesh;

  // 热力学状态变量
  private temperature = 300;     // 温度，单位：开尔文 (K)
  private volume = 2.5;          // 体积，单位：升 (L)
  private moles = 0.10;          // 摩尔数，单位：mol
  private gasType = 'nitrogen';
  private molarMassKg = 0.028;   // 摩尔质量，单位：kg/mol
  private showParticles = true;
  private pressureKpa = 99.77;   // 压强，单位：kPa

  public init(context: ExperimentContext): void {
    // 将实验仪器直接放置于黑色圆形台面上（Y=0.852，HologramStage 偏移 Y=-0.056）
    // 位于前方工作台交互区域（Z=0.92）
    this.rootGroup.position.set(0, -0.056, 0.92);

    // 1. 恒温电加热底座（直接置于台面 x = 0.04, z = 0, y = 0）
    this.heater = this.track(new ThermostatHeaterMesh());
    this.heater.group.position.set(0.04, 0, 0);
    this.rootGroup.add(this.heater.group);
    this.addDisposable(() => this.heater.dispose());

    // 2. 石英玻璃气缸与可移动活塞（直接安装于加热盘上方，y = 0.062）
    this.cylinder = this.track(new PistonCylinderMesh());
    this.cylinder.group.position.set(0.04, 0.0621, 0);
    this.rootGroup.add(this.cylinder.group);
    this.addDisposable(() => this.cylinder.dispose());

    // 3. 波登管指针式气压表（置于左侧台面 x = -0.14, z = 0, y = 0）
    this.pressureGauge = this.track(new PressureGaugeMesh());
    this.pressureGauge.group.position.set(-0.14, 0, 0);
    this.rootGroup.add(this.pressureGauge.group);
    this.addDisposable(() => this.pressureGauge.dispose());

    // 4. 精密黄铜连接导压管（从气缸底座连入气压表接口）
    const pipeGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.08, 16);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.92,
      roughness: 0.22,
    });
    this.track(pipeGeo);
    this.track(pipeMat);
    this.connectPipe = new THREE.Mesh(pipeGeo, pipeMat);
    this.connectPipe.rotation.z = Math.PI * 0.5;
    this.connectPipe.position.set(-0.10, 0.037, 0);
    this.connectPipe.castShadow = true;
    this.rootGroup.add(this.connectPipe);

    // 加热底座/气缸连接处的抛光不锈钢接头轴套
    const collarGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.008, 6);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.15,
    });
    this.track(collarGeo);
    this.track(collarMat);
    const heaterCollar = new THREE.Mesh(collarGeo, collarMat);
    heaterCollar.rotation.z = Math.PI * 0.5;
    heaterCollar.position.set(-0.065, 0.037, 0);
    heaterCollar.castShadow = true;
    this.rootGroup.add(heaterCollar);

    // 5. 微观分子动力学系统（气缸内部）
    this.molecularGas = this.track(new MolecularGasSystem());
    this.molecularGas.group.position.copy(this.cylinder.group.position);
    this.rootGroup.add(this.molecularGas.group);
    this.addDisposable(() => this.molecularGas.dispose());

    // 7. 3D 交互管理器
    this.interactionManager = new ThermoInteractionManager({
      piston: this.cylinder,
      heater: this.heater,
      onVolumeChange: (newVol) => {
        this.volume = newVol;
        this.cylinder.setPistonVolume(this.volume);
        this.recalculatePressure();
        context.setParameter('volume', parseFloat(this.volume.toFixed(2)));
      },
      onTemperatureChange: (newTemp) => {
        this.temperature = newTemp;
        this.heater.setTemperature(this.temperature);
        this.recalculatePressure();
        context.setParameter('temperature', Math.round(this.temperature));
      },
    });

    // 同步初始状态
    this.updateMolarMass();
    this.cylinder.setPistonVolume(this.volume);
    this.heater.setTemperature(this.temperature);
    this.recalculatePressure();
  }

  private updateMolarMass(): void {
    switch (this.gasType) {
      case 'helium':
        this.molarMassKg = 0.004;
        break;
      case 'co2':
        this.molarMassKg = 0.044;
        break;
      case 'argon':
        this.molarMassKg = 0.040;
        break;
      case 'nitrogen':
      default:
        this.molarMassKg = 0.028;
        break;
    }
    this.molecularGas.updateThermodynamicState(
      this.temperature,
      this.molarMassKg,
      this.cylinder.getPistonHeight()
    );
  }

  private recalculatePressure(): void {
    // 理想气体状态方程: P = nRT / V (kPa)
    // 其中 R = 8.314 J/(mol*K)，V 单位为升 (L)
    this.pressureKpa = (this.moles * 8.314 * this.temperature) / this.volume;
    this.pressureGauge.setPressure(this.pressureKpa);
    this.molecularGas.updateThermodynamicState(
      this.temperature,
      this.molarMassKg,
      this.cylinder.getPistonHeight()
    );
  }

  public getThermodynamicTelemetry(): ThermoTelemetryData {
    const vRms = Math.sqrt((3 * 8.314 * this.temperature) / this.molarMassKg);
    const vMp = Math.sqrt((2 * 8.314 * this.temperature) / this.molarMassKg);
    const vMean = Math.sqrt((8 * 8.314 * this.temperature) / (Math.PI * this.molarMassKg));
    const hist = this.molecularGas.getHistogramData(20);

    return {
      temperature: this.temperature,
      volume: this.volume,
      pressure: this.pressureKpa,
      moles: this.moles,
      molarMassKg: this.molarMassKg,
      vRms,
      vMp,
      vMean,
      speedBins: hist.bins,
      maxSpeed: hist.maxSpeed,
    };
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    switch (id) {
      case 'temperature':
        this.temperature = Number(value);
        this.heater.setTemperature(this.temperature);
        this.interactionManager.setStartTemp(this.temperature);
        this.recalculatePressure();
        break;
      case 'volume':
        this.volume = Number(value);
        this.cylinder.setPistonVolume(this.volume);
        this.recalculatePressure();
        break;
      case 'moles':
        this.moles = Number(value);
        this.recalculatePressure();
        break;
      case 'gasType':
        this.gasType = String(value);
        this.updateMolarMass();
        this.recalculatePressure();
        break;
      case 'showParticles':
        this.showParticles = Boolean(value);
        this.molecularGas.group.visible = this.showParticles;
        break;
    }
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean | void {
    return this.interactionManager.onPointerDown(event, hit, context);
  }

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
    this.interactionManager.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interactionManager.onPointerUp(event, context);
  }

  public override getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    return this.interactionManager.getHoverTarget(raycaster);
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    // 高性能分子热运动动力学更新
    if (this.showParticles) {
      this.molecularGas.update(delta, this.cylinder.getPistonHeight());
    }
  }
}

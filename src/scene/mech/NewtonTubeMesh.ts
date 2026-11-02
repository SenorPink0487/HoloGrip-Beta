/** Precision Newton tube: machined aluminum, optical glass and a rotary vacuum union. */
import * as THREE from 'three';
import {
  createChampagneBrassMaterial,
  createLevelingPadMaterial,
  createLiquidChromeMaterial,
  createOceanicSapphireMaterial,
  createSatinSilverMaterial,
  createTitaniumSlateMaterial,
  disposeObjectTree,
  mechMetal,
} from './mechKit.ts';

/** Closed, chamfered cross section of a turned component. */
function turned(profile: number[][], segments = 48): THREE.LatheGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Front-facing rounded casting, with an actual beveled perimeter. */
function casting(w: number, h: number, d: number, r = 0.008): THREE.ExtrudeGeometry {
  r = Math.min(r, w / 3, h / 3);
  const x = w / 2, y = h / 2, shape = new THREE.Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y); shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r); shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y); shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r); shape.quadraticCurveTo(-x, -y, -x + r, -y);
  const bevel = Math.min(0.0015, d * 0.18, r * 0.3);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * bevel, steps: 1, curveSegments: 5,
    bevelEnabled: true, bevelSegments: 3, bevelSize: bevel, bevelThickness: bevel,
  });
  geo.center();
  return geo;
}

export class NewtonTubeMesh {
  public readonly group = new THREE.Group();
  private standGroup = new THREE.Group();
  private rotateButtonPivot = new THREE.Group();
  private rotateButtonRing!: THREE.Mesh;
  private rotateButtonIcon!: THREE.Mesh;
  private rotateButtonHitBox!: THREE.Mesh;
  private rotateButtonHovered = false;
  public tubePivot = new THREE.Group();
  private glassOuterMesh!: THREE.Mesh;
  private glassInnerMesh!: THREE.Mesh;
  private topCapGroup = new THREE.Group();
  private bottomCapGroup = new THREE.Group();
  private graduationGroup = new THREE.Group();
  private valveKnobMesh!: THREE.Mesh;
  private valveHitBox!: THREE.Mesh;
  private objectsGroup = new THREE.Group();
  private featherGroup = new THREE.Group();
  private featherVaneMesh!: THREE.Mesh;
  private featherQuillMesh!: THREE.Mesh;
  private coinGroup = new THREE.Group();
  private coinMesh!: THREE.Mesh;
  private corkGroup = new THREE.Group();
  private corkMesh!: THREE.Mesh;
  private pumpGroup = new THREE.Group();
  private pumpPowerSwitchMesh!: THREE.Mesh;
  private pumpSwitchHitBox!: THREE.Mesh;
  private pumpLedMesh!: THREE.Mesh;
  private pumpGaugeNeedlePivot = new THREE.Group();
  private pumpIntakeNozzle = new THREE.Vector3(0.4, 0.192, -0.025);
  private hoseMesh: THREE.Mesh | null = null;
  private hoseCurve: THREE.CatmullRomCurve3 | null = null;
  private hoseMaterial!: THREE.MeshStandardMaterial;
  private glassMaterial!: THREE.MeshPhysicalMaterial;
  private innerGlassMaterial!: THREE.MeshStandardMaterial;
  private chromeMaterial!: THREE.MeshStandardMaterial;
  private precisionSlateMaterial!: THREE.MeshStandardMaterial;
  private sapphireDisplayMaterial!: THREE.MeshStandardMaterial;
  private pumpMotorMaterial!: THREE.MeshStandardMaterial;
  private switchBoxMaterial!: THREE.MeshStandardMaterial;
  private darkSiliconeMaterial!: THREE.MeshStandardMaterial;
  private brassMaterial!: THREE.MeshStandardMaterial;
  private siliconeMaterial!: THREE.MeshStandardMaterial;
  private featherMaterial!: THREE.MeshStandardMaterial;
  private featherQuillMaterial!: THREE.MeshStandardMaterial;
  private coinMaterial!: THREE.MeshStandardMaterial;
  private corkMaterial!: THREE.MeshStandardMaterial;
  private buttonGlowMaterial!: THREE.MeshStandardMaterial;
  private ledMaterial!: THREE.MeshStandardMaterial;
  private needleMaterial!: THREE.MeshBasicMaterial;
  private inkMaterial = new THREE.MeshBasicMaterial({ color: 0x435765 });
  private pressureCanvas: HTMLCanvasElement | null = null;
  private pressureTexture: THREE.CanvasTexture | null = null;
  private lastPressureText = '';
  private pulseTimers = new Set<ReturnType<typeof setTimeout>>();

  public readonly TUBE_LENGTH_M = 1.25;
  public readonly FALL_DISTANCE_M = 1.05;
  public readonly TUBE_RADIUS_M = 0.082;
  public readonly PIVOT_HEIGHT_Y = 0.74;

  constructor() {
    this.group.name = 'NewtonTubeMesh';
    this.initMaterials();
    this.createStand();
    this.createNewtonTube();
    this.createObjects();
    this.createVacuumPump();
    this.group.add(this.standGroup, this.tubePivot, this.pumpGroup, this.objectsGroup);
    this.tubePivot.position.y = this.PIVOT_HEIGHT_Y;
    this.objectsGroup.position.y = this.PIVOT_HEIGHT_Y;
    this.updateHose();
  }

  private initMaterials(): void {
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc, roughness: 0.05, metalness: 0, clearcoat: 1.0,
      clearcoatRoughness: 0.04, reflectivity: 0.88,
      transparent: true, opacity: 0.14, depthWrite: false, side: THREE.FrontSide,
    });
    this.innerGlassMaterial = new THREE.MeshStandardMaterial({ visible: false });
    this.chromeMaterial = createLiquidChromeMaterial(0xffffff, 0.98, 0.08);
    this.precisionSlateMaterial = createSatinSilverMaterial(0xe2e8f0, 0.68, 0.26);
    this.sapphireDisplayMaterial = createOceanicSapphireMaterial(0x0a192f, 0.25, 0.30);
    this.pumpMotorMaterial = createSatinSilverMaterial(0x8da2b5, 0.55, 0.30);
    this.switchBoxMaterial = createSatinSilverMaterial(0xcbd5e1, 0.60, 0.25);
    this.darkSiliconeMaterial = createLevelingPadMaterial(0x475569, 0.85);
    this.brassMaterial = createChampagneBrassMaterial(0xc4cbd4, 0.85, 0.22); // 银灰钛金五金，杜绝亮黄
    this.siliconeMaterial = new THREE.MeshStandardMaterial({ color: 0xc5d9dc, roughness: 0.65 });
    this.featherMaterial = new THREE.MeshStandardMaterial({ color: 0xf5eee0, roughness: 0.8, side: THREE.DoubleSide });
    this.featherQuillMaterial = mechMetal(0xcbbd9d, 0.04, 0.7);
    this.coinMaterial = createLiquidChromeMaterial(0xf1f5f9, 0.92, 0.15);
    this.corkMaterial = mechMetal(0xb38b5b, 0, 0.95);
    this.buttonGlowMaterial = new THREE.MeshStandardMaterial({ color: 0x72b6c4, emissive: 0x407f94, emissiveIntensity: 0.16, roughness: 0.4 });
    this.ledMaterial = new THREE.MeshStandardMaterial({ color: 0x85c4af, emissive: 0x55b991, emissiveIntensity: 0.4 });
    this.needleMaterial = new THREE.MeshBasicMaterial({ color: 0xd0a672 });
    this.hoseMaterial = new THREE.MeshStandardMaterial({ color: 0x9db3bd, roughness: 0.42, metalness: 0.05 });
  }

  private part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
    x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** Repeated machining details share geometry and a single draw call. */
  private instances(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
    poses: { p: number[]; r?: number[]; s?: number[] }[], name: string): void {
    const mesh = new THREE.InstancedMesh(geo, mat, poses.length);
    const dummy = new THREE.Object3D();
    poses.forEach(({ p, r, s }, i) => {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.rotation.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0);
      dummy.scale.set(s?.[0] ?? 1, s?.[1] ?? 1, s?.[2] ?? 1);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
  }

  /** Text is printed on actual instrument surfaces, never added as floating DOM. */
  private label(parent: THREE.Object3D, text: string, w: number, h: number,
    x: number, y: number, z: number, color = '#435765'): THREE.Mesh {
    let map: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 768; canvas.height = 128;
      const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (ctx) {
        ctx.fillStyle = color; ctx.font = '500 68px Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 384, 65, 744);
        map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 4;
      }
    }
    const mat = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0x435765,
      transparent: true, opacity: map ? 1 : 0, depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -1, side: THREE.DoubleSide });
    const mesh = this.part(parent, new THREE.PlaneGeometry(w, h), mat, x, y, z);
    mesh.castShadow = false; mesh.receiveShadow = false;
    return mesh;
  }

  private createStand(): void {
    // A broad rounded casting, recessed top deck and four adjustable isolators.
    const base = this.part(this.standGroup, casting(0.46, 0.30, 0.032, 0.045), this.precisionSlateMaterial, 0, 0.034, 0.012);
    base.rotation.x = -Math.PI / 2;
    const deck = this.part(this.standGroup, casting(0.425, 0.26, 0.005, 0.037), this.switchBoxMaterial, 0, 0.053, 0.012);
    deck.rotation.x = -Math.PI / 2;
    const footGeo = turned([[0,0],[0.021,0],[0.024,0.004],[0.024,0.009],[0.021,0.012],[0.015,0.012],[0.015,0.02],[0,0.02]]);
    this.instances(this.standGroup, footGeo, this.darkSiliconeMaterial,
      [-0.17,0.17].flatMap(x => [-0.09,0.105].map(z => ({p:[x,0,z]}))), 'freefall-isolation-feet');
    this.instances(this.standGroup, turned([[0,0],[0.017,0],[0.019,0.003],[0.019,0.009],[0.017,0.012],[0,0.012]]), this.brassMaterial,
      [-0.17,0.17].flatMap(x => [-0.09,0.105].map(z => ({p:[x,0.012,z]}))), 'freefall-leveling-collars');

    // Twin polished rods and a dovetail carriage stay behind the transparent tube.
    const rods = [-0.184, -0.135];
    const shaft = turned([[0,0],[0.009,0],[0.011,0.003],[0.011,0.67],[0.009,0.674],[0,0.674]], 32);
    this.instances(this.standGroup, shaft, this.chromeMaterial, rods.map(x => ({p:[x,0.061,-0.105]})), 'freefall-dual-guide-rods');
    const socket = turned([[0.011,0],[0.023,0],[0.026,0.004],[0.026,0.016],[0.022,0.02],[0.011,0.02],[0.011,0]]);
    this.instances(this.standGroup, socket, this.precisionSlateMaterial, rods.map(x => ({p:[x,0.055,-0.105]})), 'freefall-rod-sockets');
    this.part(this.standGroup, casting(0.081,0.09,0.034), this.precisionSlateMaterial,-0.16,0.706,-0.105);
    this.part(this.standGroup, casting(0.162,0.031,0.032), this.chromeMaterial,-0.08,0.74,-0.108);
    const bearing = this.part(this.standGroup, turned([[0,0],[0.028,0],[0.032,0.004],[0.032,0.03],[0.025,0.036],[0,0.036]]), this.switchBoxMaterial,0,0.74,-0.13);
    bearing.rotation.x = Math.PI / 2;
    const lock = this.part(this.standGroup, turned([[0,0],[0.017,0],[0.020,0.003],[0.020,0.014],[0.016,0.017],[0,0.017]]),this.brassMaterial,-0.207,0.71,-0.102);
    lock.rotation.z = Math.PI / 2;
    this.instances(this.standGroup, new THREE.CapsuleGeometry(0.001,0.01,3,6),this.chromeMaterial,
      Array.from({length:24},(_,i)=>({p:[-0.214,0.71+0.02*Math.sin(i*Math.PI/12),-0.102+0.02*Math.cos(i*Math.PI/12)],r:[0,0,Math.PI/2]})), 'freefall-knurled-lock');
    this.instances(this.standGroup, new THREE.CylinderGeometry(0.0035,0.0035,0.002,6),this.chromeMaterial,
      [-0.195,-0.125].flatMap(x=>[0.68,0.73].map(y=>({p:[x,y,-0.086],r:[Math.PI/2,0,0]}))), 'freefall-carriage-fasteners');

    // One centered inversion button on a compact sloped control fascia.
    const console = new THREE.Group();
    console.position.set(0.025,0.082,0.116); console.rotation.x = -Math.PI/5;
    this.standGroup.add(console);
    this.part(console,casting(0.17,0.085,0.022,0.014),this.precisionSlateMaterial);
    this.rotateButtonPivot.position.set(0,-0.003,0.015);
    this.rotateButtonPivot.name='freefall-rotate-button';
    console.add(this.rotateButtonPivot);
    const btnGeo=turned([[0,0],[0.021,0],[0.024,0.002],[0.024,0.006],[0.021,0.008],[0,0.008]],40);
    const face=this.part(this.rotateButtonPivot,btnGeo,this.switchBoxMaterial);
    face.rotation.x=-Math.PI/2;
    this.rotateButtonRing=this.part(this.rotateButtonPivot,new THREE.TorusGeometry(0.020,0.0011,8,40),this.buttonGlowMaterial,0,0,0.002);
    this.rotateButtonHitBox=this.part(this.rotateButtonPivot,new THREE.CylinderGeometry(0.036,0.036,0.018,24),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),0,0,0.005);
    this.rotateButtonHitBox.rotation.x=Math.PI/2;
    this.rotateButtonHitBox.name='freefall-rotate-button';
    this.rotateButtonHitBox.userData.isRotateButton=true;
    this.rotateButtonIcon=this.part(this.rotateButtonPivot,new THREE.TorusGeometry(0.011,0.0012,6,28,Math.PI*1.55),this.inkMaterial,0,0,0.003);
    const tip=this.part(this.rotateButtonPivot,new THREE.ConeGeometry(0.003,0.005,3),this.inkMaterial,0.011,0,0.003);
    tip.rotation.z=-0.6;
    this.label(console,'旋转 180° / R',0.125,0.016,0,-0.032,0.012);
  }

  private createNewtonTube(): void {
    const r=this.TUBE_RADIUS_M, half=this.TUBE_LENGTH_M/2;
    // A split annular clamp with a genuine bore, open at the viewing face.
    const profile=[[r+0.001,-0.014],[r+0.009,-0.014],[r+0.012,-0.01],[r+0.012,0.01],[r+0.009,0.014],[r+0.001,0.014],[r+0.001,-0.014]];
    const clampGeo=new THREE.LatheGeometry(profile.map(([a,b])=>new THREE.Vector2(a,b)),48,Math.PI*0.32,Math.PI*1.36);
    const clamp=this.part(this.tubePivot,clampGeo,this.precisionSlateMaterial); clamp.name='freefall-open-bore-clamp';
    this.glassOuterMesh=this.part(this.tubePivot,new THREE.CylinderGeometry(r,r,this.TUBE_LENGTH_M,96,1,true),this.glassMaterial);
    this.glassOuterMesh.name='freefall-tube'; this.glassOuterMesh.userData.isNewtonTube=true;
    this.glassOuterMesh.castShadow=false; this.glassOuterMesh.receiveShadow=false; this.glassOuterMesh.renderOrder=10;
    this.glassInnerMesh=this.part(this.tubePivot,new THREE.CylinderGeometry(r-0.003,r-0.003,this.TUBE_LENGTH_M,64,1,true),this.innerGlassMaterial);
    this.glassInnerMesh.visible=false;
    // Thin Fresnel edge ribbons establish the cylinder without clouding its contents.
    const edgeMat=new THREE.MeshBasicMaterial({color:0x82acba,transparent:true,opacity:0.32,depthWrite:false,side:THREE.DoubleSide});
    for(const phi of [Math.PI*0.46,Math.PI*1.46]) {
      const edge=this.part(this.tubePivot,new THREE.CylinderGeometry(r+0.0002,r+0.0002,this.TUBE_LENGTH_M-0.03,3,1,true,phi,0.045),edgeMat);
      edge.castShadow=false; edge.renderOrder=11;
    }
    const glintMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.32,depthWrite:false,side:THREE.DoubleSide});
    const glint=this.part(this.tubePivot,new THREE.CylinderGeometry(r+0.0003,r+0.0003,1.13,3,1,true,0.55,0.065),glintMat);
    glint.castShadow=false; glint.renderOrder=11;

    // Trace the section from the inner face outwards and upwards: the previous
    // reversed winding exposed the back of the lid and produced radial artifacts.
    // Extend the shell to the cushion so the landing cup is physically supported.
    const capGeo=turned([[0,-0.066],[0.072,-0.066],[0.078,-0.062],[0.078,-0.022],[0.087,-0.020],[0.091,-0.014],[0.091,0.010],[0.083,0.015],[0.071,0.015],[0.068,0.011],[0,0.011]],64);
    const lidGeo=turned([[0,0.0115],[0.058,0.0115],[0.062,0.014],[0.062,0.016],[0.058,0.018],[0,0.018]],64);
    const lidMaterial=mechMetal(0xd8e2e9,0.64,0.36);
    const gasketGeo=turned([[0.075,-0.023],[0.083,-0.023],[0.085,-0.021],[0.085,-0.018],[0.075,-0.018],[0.075,-0.023]]);
    const capBolts=Array.from({length:8},(_,i)=>({p:[0.077*Math.sin(i*Math.PI/4),0.017,0.077*Math.cos(i*Math.PI/4)]}));
    for(const [cap,sign] of [[this.topCapGroup,1],[this.bottomCapGroup,-1]] as const) {
      cap.position.y=half*sign; cap.rotation.z=sign===1?0:Math.PI;
      const shell=this.part(cap,capGeo,this.precisionSlateMaterial);
      shell.name='freefall-endcap-shell';
      this.part(cap,gasketGeo,this.darkSiliconeMaterial);
      // Keep the lid underside off the shell face to avoid coplanar depth flicker.
      const lid=this.part(cap,lidGeo,lidMaterial);
      lid.name='freefall-endcap-lid';
      this.instances(cap,new THREE.CylinderGeometry(0.0033,0.0033,0.003,6),this.chromeMaterial,capBolts,'freefall-cap-fasteners');
      this.instances(cap,new THREE.CapsuleGeometry(0.0008,0.014,2,5),this.switchBoxMaterial,
        Array.from({length:48},(_,i)=>({p:[0.091*Math.sin(i*Math.PI/24),-0.002,0.091*Math.cos(i*Math.PI/24)]})), 'freefall-cap-knurling');
      // Thin recessed landing cup; its upper face is at the solver's landing plane.
      this.part(cap,turned([[0,-0.073],[0.071,-0.073],[0.075,-0.069],[0.075,-0.064],[0.070,-0.061],[0,-0.061]]),this.siliconeMaterial);
      this.tubePivot.add(cap);
    }
    const valve=this.part(this.bottomCapGroup,turned([[0,0],[0.009,0],[0.013,0.004],[0.013,0.025],[0.009,0.029],[0,0.029]]),this.brassMaterial,0,0.018,0);
    valve.name='freefall-vent-body';
    this.valveKnobMesh=this.part(this.bottomCapGroup,casting(0.033,0.008,0.014,0.003),this.switchBoxMaterial,0,0.05,0);
    this.valveKnobMesh.name='freefall-valve';
    this.valveHitBox=this.part(this.bottomCapGroup,new THREE.SphereGeometry(0.04,12,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),0,0.047,0);
    this.valveHitBox.name='freefall-valve';this.valveHitBox.userData.isValve=true;

    // Stationary hose connection and rotary union, coaxial with the inversion bearing.
    const union=this.part(this.standGroup,turned([[0,0],[0.012,0],[0.017,0.004],[0.017,0.028],[0.012,0.033],[0,0.033]]),this.brassMaterial,0.105,this.PIVOT_HEIGHT_Y,-0.10);
    union.rotation.z=-Math.PI/2; union.name='freefall-rotary-vacuum-union';
    this.part(this.standGroup,casting(0.105,0.022,0.022,0.007),this.precisionSlateMaterial,0.058,this.PIVOT_HEIGHT_Y,-0.10);
    this.createGraduationMarks(); this.tubePivot.add(this.graduationGroup);
  }

  private createGraduationMarks(): void {
    // 10 mm graduations; a narrow front-left scale leaves the central fall lanes clear.
    const poses=[];
    for(let i=0;i<=105;i++) {
      const w=i%10===0?0.018:i%5===0?0.012:0.006;
      poses.push({p:[-0.057+w/2,this.FALL_DISTANCE_M/2-i*0.01,0.061],s:[w,0.0008,0.0006]});
      if(i%10===0) this.label(this.graduationGroup,String(i),0.018,0.009,-0.067,this.FALL_DISTANCE_M/2-i*0.01,0.05);
    }
    this.instances(this.graduationGroup,new THREE.BoxGeometry(1,1,1),this.inkMaterial,poses,'freefall-centimeter-graduations');
    this.label(this.graduationGroup,'cm',0.019,0.009,-0.067,0.555,0.05);
  }

  private createObjects(): void {
    this.createFeatherMesh(); this.featherGroup.name='freefall-feather';
    this.corkMesh=this.part(this.corkGroup,turned([[0,-0.021],[0.019,-0.021],[0.022,-0.018],[0.018,0.018],[0.016,0.021],[0,0.021]]),this.corkMaterial);
    // Deterministic pores, rather than wooden barrel bands.
    const pores=Array.from({length:85},(_,i)=>{
      const a=i*2.39996,y=((i*17)%83)/83*0.035-0.0175;
      const radius=0.020-y*0.11;
      return {p:[radius*Math.sin(a),y,radius*Math.cos(a)],s:[0.5+(i%3)*0.25,0.4+(i%4)*0.3,0.3]};
    });
    this.instances(this.corkGroup,new THREE.SphereGeometry(0.001,4,3),mechMetal(0x805f3c,0,1),pores,'freefall-cork-pores');
    this.corkGroup.name='freefall-cork';
    this.coinMesh=this.part(this.coinGroup,turned([[0,-0.0018],[0.021,-0.0018],[0.024,-0.001],[0.024,0.001],[0.021,0.0018],[0,0.0018]],64),this.coinMaterial);
    this.coinMesh.rotation.x=Math.PI/2;
    for(const z of [-0.0019,0.0019]) this.part(this.coinGroup,new THREE.TorusGeometry(0.021,0.0008,6,48),this.coinMaterial,0,0,z);
    this.createRenminbiFace(false);
    this.createRenminbiFace(true);
    // The one-yuan coin has a smooth edge with repeated RMB lettering.
    for(let i=0;i<3;i++) {
      const angle=i*Math.PI*2/3;
      const edge=this.label(this.coinGroup,'RMB',0.009,0.0018,0.0241*Math.cos(angle),0.0241*Math.sin(angle),0,'#667582');
      edge.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(-Math.sin(angle),Math.cos(angle),0),
        new THREE.Vector3(0,0,1),new THREE.Vector3(Math.cos(angle),Math.sin(angle),0)));
      edge.name='freefall-renminbi-edge';
    }
    this.coinGroup.name='freefall-coin';
    this.objectsGroup.add(this.featherGroup,this.corkGroup,this.coinGroup);
    this.setObjectsState(this.FALL_DISTANCE_M,this.FALL_DISTANCE_M,this.FALL_DISTANCE_M);
  }

  /** Stylized fifth-series RMB one-yuan relief, based on the PBOC design reference:
   * https://www.pbc.gov.cn/rmyh/2019rmb/index.html
   * Obverse denomination, bank name and year; reverse chrysanthemum and pinyin.
   */
  private createRenminbiFace(reverse: boolean): void {
    const material=this.coinMaterial.clone();
    if(typeof document!=='undefined') {
      const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=1024;
      const ctx=typeof canvas.getContext==='function'?canvas.getContext('2d'):null;
      if(ctx) {
        ctx.fillStyle='#d6dde2'; ctx.fillRect(0,0,1024,1024);
        ctx.strokeStyle='#83909b'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(512,512,472,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='#536471'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.shadowColor='#ffffff'; ctx.shadowBlur=1; ctx.shadowOffsetX=2; ctx.shadowOffsetY=2;
        const arcText=(text: string,radius: number,font: string,span: number) => {
          ctx.font=font;
          Array.from(text).forEach((char,i)=>{
            const angle=-span/2+span*i/Math.max(1,text.length-1);
            ctx.save(); ctx.translate(512+radius*Math.sin(angle),512-radius*Math.cos(angle));
            ctx.rotate(angle); ctx.fillText(char,0,0); ctx.restore();
          });
        };
        if(!reverse) {
          arcText('中国人民银行',354,'500 78px "Songti SC", "SimSun", serif',1.9);
          ctx.font='italic 600 460px Arial, sans-serif'; ctx.fillText('1',460,492);
          ctx.font='500 115px "Songti SC", "SimSun", serif'; ctx.fillText('元',684,576);
          ctx.font='500 57px Arial, sans-serif'; ctx.fillText('YI YUAN',512,744);
          ctx.font='500 55px Arial, sans-serif'; ctx.fillText('2019',512,849);
        } else {
          arcText('ZHONGGUO RENMIN YINHANG',385,'500 39px Arial, sans-serif',3.45);
          // Layered narrow curved petals form a chrysanthemum engraving.
          ctx.save(); ctx.translate(480,475); ctx.lineWidth=4;
          for(let ring=0;ring<3;ring++) {
            const count=18+ring*7,inner=22+ring*35,outer=115+ring*66;
            for(let i=0;i<count;i++) {
              const a=i*Math.PI*2/count+ring*0.13;
              ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0,-inner);
              ctx.bezierCurveTo(-24,-outer*0.7,-20,-outer,0,-outer);
              ctx.bezierCurveTo(20,-outer,24,-outer*0.7,0,-inner);
              ctx.stroke(); ctx.restore();
            }
          }
          ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.stroke();
          ctx.beginPath();ctx.moveTo(12,150);ctx.bezierCurveTo(60,230,120,280,90,368);ctx.stroke();
          for(const side of [-1,1]) {
            ctx.beginPath();ctx.moveTo(83,283);
            ctx.bezierCurveTo(83+side*65,205,83+side*130,210,83+side*113,285);
            ctx.bezierCurveTo(83+side*67,316,83+side*27,298,83,283);ctx.stroke();
          }
          ctx.restore();
        }
        const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
        texture.anisotropy=4; material.map=texture; material.bumpMap=texture;
        material.bumpScale=-0.00012;
      }
    }
    const face=this.part(this.coinGroup,new THREE.CircleGeometry(0.0201,64),material,0,0,reverse?-0.00185:0.00185);
    face.rotation.y=reverse?Math.PI:0;
    face.name=reverse?'freefall-renminbi-reverse':'freefall-renminbi-obverse';
    this.coinGroup.userData.currency='CNY'; this.coinGroup.userData.denomination=1;
  }

  private createFeatherMesh(): void {
    const quill=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-0.06,0),new THREE.Vector3(0,-0.01,0.002),new THREE.Vector3(0.003,0.06,0)]);
    this.featherQuillMesh=this.part(this.featherGroup,new THREE.TubeGeometry(quill,20,0.0007,6,false),this.featherQuillMaterial);
    const shape=new THREE.Shape();shape.moveTo(0,-0.044);
    shape.bezierCurveTo(0.021,-0.025,0.022,0.033,0.003,0.061);
    shape.bezierCurveTo(-0.015,0.034,-0.018,-0.026,0,-0.044);
    const geo=new THREE.ShapeGeometry(shape,24);
    const pos=geo.getAttribute('position');
    for(let i=0;i<pos.count;i++) pos.setZ(i,0.002*Math.sin(pos.getY(i)*35)+Math.abs(pos.getX(i))*0.14);
    geo.computeVertexNormals();
    this.featherVaneMesh=this.part(this.featherGroup,geo,this.featherMaterial);
    const vertices:number[]=[];
    for(let i=0;i<36;i++) {
      const y=-0.04+i*0.00265;
      const w=0.018*Math.pow(Math.max(0,Math.sin((y+0.044)/0.105*Math.PI)),0.8);
      for(const sign of [-1,1]) vertices.push(0.001,y,0.003,sign*w,y+0.009,0.004);
    }
    const barbs=new THREE.BufferGeometry();barbs.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    this.featherGroup.add(new THREE.LineSegments(barbs,new THREE.LineBasicMaterial({color:0xbdb39d,transparent:true,opacity:0.5})));
  }

  private createVacuumPump(): void {
    this.pumpGroup.name='freefall-pump';this.pumpGroup.position.set(0.49,0,-0.03);
    const base=this.part(this.pumpGroup,casting(0.29,0.20,0.025,0.022),this.precisionSlateMaterial,0,0.032,0);
    base.rotation.x=-Math.PI/2;
    this.instances(this.pumpGroup,turned([[0,0],[0.016,0],[0.018,0.003],[0.018,0.015],[0.014,0.019],[0,0.019]]),this.darkSiliconeMaterial,
      [-0.115,0.115].flatMap(x=>[-0.07,0.07].map(z=>({p:[x,0,z]}))),'freefall-pump-isolators');
    this.part(this.pumpGroup,casting(0.115,0.123,0.14,0.014),this.precisionSlateMaterial,-0.075,0.103,0);
    const motor=this.part(this.pumpGroup,turned([[0,0],[0.047,0],[0.053,0.005],[0.053,0.12],[0.048,0.128],[0,0.128]]),this.pumpMotorMaterial,-0.01,0.102,0);
    motor.rotation.z=-Math.PI/2;
    const finGeo=turned([[0.051,-0.0015],[0.058,-0.0015],[0.060,0],[0.058,0.0015],[0.051,0.0015],[0.051,-0.0015]],40);
    this.instances(this.pumpGroup,finGeo,this.pumpMotorMaterial,Array.from({length:11},(_,i)=>({p:[0.004+i*0.01,0.102,0],r:[0,0,-Math.PI/2]})),'freefall-motor-cooling-fins');
    const fan=this.part(this.pumpGroup,turned([[0,0],[0.048,0],[0.052,0.003],[0.052,0.009],[0.048,0.013],[0,0.013]]),this.switchBoxMaterial,0.118,0.102,0);fan.rotation.z=-Math.PI/2;
    const nozzleGeo=turned([[0,0],[0.014,0],[0.016,0.004],[0.016,0.009],[0.009,0.012],[0.009,0.028],[0.011,0.03],[0.009,0.034],[0,0.034]],32);
    this.part(this.pumpGroup,nozzleGeo,this.brassMaterial,-0.09,0.158,0.005);
    // Compression ring and relief sleeve hold the hose at the inlet.
    this.part(this.pumpGroup,turned([[0.007,0],[0.012,0],[0.014,0.003],[0.014,0.008],[0.012,0.01],[0.007,0.01],[0.007,0]]),this.chromeMaterial,-0.09,0.182,0.005);
    this.part(this.pumpGroup,turned([[0,0],[0.014,0],[0.017,0.004],[0.017,0.038],[0.014,0.043],[0,0.043]]),this.switchBoxMaterial,-0.06,0.163,-0.04);
    const handleCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-0.045,0.15,-0.02),new THREE.Vector3(-0.035,0.207,-0.02),new THREE.Vector3(0.065,0.207,-0.02),new THREE.Vector3(0.078,0.15,-0.02)]);
    this.part(this.pumpGroup,new THREE.TubeGeometry(handleCurve,28,0.005,10,false),this.chromeMaterial);
    this.part(this.pumpGroup,casting(0.065,0.012,0.014,0.005),this.siliconeMaterial,0.015,0.208,-0.02);

    const gauge=new THREE.Group();gauge.position.set(-0.075,0.111,0.075);this.pumpGroup.add(gauge);
    const bezel=this.part(gauge,turned([[0.033,0],[0.037,0],[0.040,0.003],[0.040,0.009],[0.037,0.012],[0.033,0.012],[0.033,0]]),this.chromeMaterial);bezel.rotation.x=Math.PI/2;
    this.part(gauge,new THREE.CircleGeometry(0.033,48),this.sapphireDisplayMaterial,0,0,0.004);
    const gaugeInk=new THREE.MeshBasicMaterial({color:0xd5e5e9});
    this.instances(gauge,new THREE.BoxGeometry(1,1,1),gaugeInk,Array.from({length:41},(_,i)=>{
      const a=(-135+i*6.75)*Math.PI/180;
      return {p:[Math.sin(a)*0.027,Math.cos(a)*0.027,0.005],r:[0,0,-a],s:[0.0006,i%5===0?0.004:0.002,0.0005]};
    }),'freefall-pressure-gauge-ticks');
    this.label(gauge,'kPa',0.018,0.005,0,-0.015,0.006,'#d5e5e9');
    this.label(gauge,'0',0.006,0.005,-0.016,-0.018,0.006,'#d5e5e9');
    this.label(gauge,'100',0.012,0.005,0.017,-0.018,0.006,'#d5e5e9');
    this.pumpGaugeNeedlePivot.position.z=0.007;gauge.add(this.pumpGaugeNeedlePivot);
    this.part(this.pumpGaugeNeedlePivot,casting(0.0013,0.023,0.0006,0.0004),this.needleMaterial,0,0.009,0);
    this.part(gauge,new THREE.SphereGeometry(0.003,12,6),this.brassMaterial,0,0,0.008);
    const lens=this.part(gauge,new THREE.CircleGeometry(0.033,48),this.glassMaterial,0,0,0.01);lens.castShadow=false;

    const fascia=new THREE.Group();fascia.position.set(0.045,0.073,0.076);this.pumpGroup.add(fascia);
    this.part(fascia,casting(0.102,0.061,0.008,0.008),this.switchBoxMaterial);
    this.part(fascia,casting(0.086,0.022,0.002,0.003),this.sapphireDisplayMaterial,0,0.014,0.005);
    const display=this.label(fascia,'101.3',0.064,0.014,-0.006,0.014,0.006,'#b8e5e0');
    const displayMap=(display.material as THREE.MeshBasicMaterial).map;
    if(displayMap instanceof THREE.CanvasTexture){this.pressureTexture=displayMap;this.pressureCanvas=displayMap.image as HTMLCanvasElement;}
    this.label(fascia,'kPa',0.015,0.007,0.032,0.013,0.006,'#b8e5e0');
    this.pumpPowerSwitchMesh=this.part(fascia,casting(0.033,0.017,0.007,0.004),this.chromeMaterial,-0.021,-0.014,0.007);
    this.pumpPowerSwitchMesh.name='freefall-pump-switch';
    this.label(fascia,'I / O',0.020,0.009,-0.021,-0.014,0.011);
    this.pumpLedMesh=this.part(fascia,new THREE.SphereGeometry(0.0025,12,8),this.ledMaterial,0.026,-0.013,0.007);
    this.label(this.pumpGroup,'V A C U U M   /   VP–01',0.13,0.010,-0.04,0.031,0.102);
    this.instances(this.pumpGroup,new THREE.CylinderGeometry(0.003,0.003,0.002,6),this.chromeMaterial,
      [-0.121,-0.029].flatMap(x=>[0.054,0.149].map(y=>({p:[x,y,0.072],r:[Math.PI/2,0,0]}))),'freefall-pump-fasteners');
    this.pumpSwitchHitBox=this.part(this.pumpGroup,new THREE.BoxGeometry(0.29,0.22,0.22),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),0,0.11,0);
    this.pumpSwitchHitBox.name='freefall-pump-switch';this.pumpSwitchHitBox.userData.isPumpSwitch=true;
  }

  /** The hose terminates at a stationary rotary union, outside the observation aperture. */
  public updateHose(): void {
    if(this.hoseMesh) return;
    this.hoseCurve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.138,this.PIVOT_HEIGHT_Y,-0.10),
      new THREE.Vector3(0.205,this.PIVOT_HEIGHT_Y-0.015,-0.10),
      new THREE.Vector3(0.26,0.49,-0.095),
      new THREE.Vector3(0.29,0.22,-0.08),
      new THREE.Vector3(0.35,0.09,-0.055),
      new THREE.Vector3(0.40,0.15,-0.025),
      this.pumpIntakeNozzle.clone(),
    ]);
    this.hoseMesh=this.part(this.group,new THREE.TubeGeometry(this.hoseCurve,64,0.006,12,false),this.hoseMaterial);
    this.hoseMesh.name='freefall-hose';
    this.instances(this.standGroup,new THREE.TorusGeometry(0.007,0.001,5,16),this.switchBoxMaterial,
      Array.from({length:6},(_,i)=>({p:[0.14+i*0.004,0.74,-0.10],r:[0,Math.PI/2,0]})),'freefall-hose-strain-relief');
  }

  private lastHoseAngle = -999999;

  /**
   * 更新牛顿管旋转角度 (Rad)
   */
  public setTubeRotation(angleRad: number): void {
    this.tubePivot.rotation.z = angleRad;
    if (Math.abs(angleRad - this.lastHoseAngle) < 0.015) return;
    this.lastHoseAngle = angleRad;
    this.updateHose();
  }

  /**
   * 更新管内三物体在空间中的位置与姿态
   *
   * 物理原则：
   * 1. 重力恒定垂直向下 (朝向实验台 -Y 方向)。
   * 2. 初始或着陆后，物体稳固落在管底晶透硅胶垫上，杜绝悬浮反常识。
   * 3. 倒转翻转过程中，物体跟随管底端盖在旋转圆弧上平滑上升至管顶。
   * 4. 倒转完成后释放下落，各物体沿竖直管身从管顶 (+halfH) 垂直加速下落至管底 (-halfH)。
   */
  public setObjectsState(
    featherY: number,
    coinY: number,
    corkY: number,
    flutterX = 0,
    flutterAngle = 0,
    isRotating = false,
    tubeRotationAngle = 0,
    startAngle = 0
  ): void {
    const halfH = this.FALL_DISTANCE_M / 2;

    const coinLaneX = -0.038;
    const corkLaneX = 0;
    const featherLaneX = 0.038;

    if (isRotating) {
      // 翻转过程中：物体跟随管底端盖在旋转圆弧上平滑上升至管顶
      // 翻转开始前各物体在管底 (-halfH)，其横向通道坐标由翻转起点管体朝向决定
      const N_start = Math.round(startAngle / Math.PI);
      const signStart = Math.abs(N_start) % 2 === 0 ? 1 : -1;

      const coinStartX = coinLaneX * signStart;
      const corkStartX = corkLaneX * signStart;
      const featherStartX = featherLaneX * signStart;

      // 相对当前次翻转起点的旋转角增量 alpha ∈ [0, π]
      const alpha = tubeRotationAngle - startAngle;
      const cosA = Math.cos(alpha);
      const sinA = Math.sin(alpha);

      // 围绕中央转轴进行严密的刚体旋转变换：
      // 起点为 (xStart, -halfH)
      // x' = xStart * cos(alpha) - (-halfH) * sin(alpha) = xStart * cos(alpha) + halfH * sin(alpha)
      // y' = xStart * sin(alpha) + (-halfH) * cos(alpha) = xStart * sin(alpha) - halfH * cos(alpha)
      this.coinGroup.position.set(
        coinStartX * cosA + halfH * sinA,
        coinStartX * sinA - halfH * cosA,
        0
      );
      this.coinGroup.rotation.z = tubeRotationAngle;

      this.corkGroup.position.set(
        corkStartX * cosA + halfH * sinA,
        corkStartX * sinA - halfH * cosA,
        0
      );
      this.corkGroup.rotation.z = tubeRotationAngle;

      this.featherGroup.position.set(
        featherStartX * cosA + halfH * sinA,
        featherStartX * sinA - halfH * cosA,
        0
      );
      this.featherGroup.rotation.z = tubeRotationAngle;
    } else {
      // 竖直状态下：下落运动或管底静止
      // 当前竖直管体朝向周期：
      const N_end = Math.round(tubeRotationAngle / Math.PI);
      const signEnd = Math.abs(N_end) % 2 === 0 ? 1 : -1;

      // 翻转完成到达管顶释放点时，世界空间 X 坐标与翻转到达点完全平滑连续 (无突跳)
      const curCoinX = coinLaneX * signEnd;
      const curCorkX = corkLaneX * signEnd;
      const curFeatherX = featherLaneX * signEnd;

      // y 从 0 (管顶 +halfH) 到 fallDistanceM (管底 -halfH)，重力方向恒定垂直向下！
      const localFeatherY = halfH - featherY;
      const localCoinY = halfH - coinY;
      const localCorkY = halfH - corkY;

      // 硬币
      this.coinGroup.position.set(curCoinX, localCoinY, 0);
      this.coinGroup.rotation.z = Math.abs(N_end) % 2 === 0 ? 0 : Math.PI;

      // 软木塞
      this.corkGroup.position.set(curCorkX, localCorkY, 0);
      this.corkGroup.rotation.z = Math.abs(N_end) % 2 === 0 ? 0 : Math.PI;

      // 羽毛：带有空气阻力引发的左右飘舞与迎角
      this.featherGroup.position.set(curFeatherX + flutterX, localFeatherY, 0);
      this.featherGroup.rotation.z = (Math.abs(N_end) % 2 === 0 ? 0 : Math.PI) + flutterAngle;
    }
  }

  /**
   * 更新抽气机与压力表状态
   */
  public setPumpState(isPumpRunning: boolean, pressureKPa: number): void {
    if (isPumpRunning) {
      this.ledMaterial.emissive.setHex(0x10b981);
      this.ledMaterial.emissiveIntensity = 1.0;
    } else {
      // 待机时使用柔和的浅天蓝微弱待机光，彻底去除沉重暗黑色
      this.ledMaterial.emissive.setHex(0x38bdf8);
      this.ledMaterial.emissiveIntensity = 0.2;
    }

    const ratio = Math.max(0, Math.min(1.0, pressureKPa / 101.325));
    const needleAngle = (0.75 - 1.5 * ratio) * Math.PI;
    this.pumpGaugeNeedlePivot.rotation.z = needleAngle;
    this.pumpPowerSwitchMesh.rotation.x = isPumpRunning ? -0.12 : 0.12;
    const text = Math.max(0, pressureKPa).toFixed(1);
    if (text !== this.lastPressureText && this.pressureCanvas && this.pressureTexture) {
      this.lastPressureText = text;
      const ctx = this.pressureCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 768, 128); ctx.fillStyle = '#b8e5e0';
        ctx.font = '500 80px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 384, 65); this.pressureTexture.needsUpdate = true;
      }
    }
  }

  /**
   * 设置 3D 旋转按钮的高亮状态
   */
  public setRotateButtonHovered(hovered: boolean): void {
    if (this.rotateButtonHovered === hovered) return;
    this.rotateButtonHovered = hovered;
    if (hovered) {
      this.buttonGlowMaterial.emissive.setHex(0x38bdf8);
      this.buttonGlowMaterial.emissiveIntensity = 0.9;
      this.rotateButtonPivot.scale.set(1.08, 1.08, 1.08);
    } else {
      this.buttonGlowMaterial.emissive.setHex(0x0284c7);
      this.buttonGlowMaterial.emissiveIntensity = 0.16;
      this.rotateButtonPivot.scale.set(1.0, 1.0, 1.0);
    }
  }

  /**
   * 触发旋转按钮点击脉冲波动画
   */
  public pulseRotateButton(): void {
    this.rotateButtonPivot.scale.set(0.92, 0.92, 0.92);
    const timer = setTimeout(() => {
      this.rotateButtonPivot.scale.set(1.0, 1.0, 1.0);
      this.pulseTimers.delete(timer);
    }, 120);
    this.pulseTimers.add(timer);
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    if (this.rotateButtonHitBox) list.push(this.rotateButtonHitBox);
    else if (this.rotateButtonPivot) list.push(this.rotateButtonPivot);
    if (this.pumpSwitchHitBox) list.push(this.pumpSwitchHitBox);
    else if (this.pumpPowerSwitchMesh) list.push(this.pumpPowerSwitchMesh);
    if (this.valveHitBox) list.push(this.valveHitBox);
    if (this.featherGroup) list.push(this.featherGroup);
    if (this.coinGroup) list.push(this.coinGroup);
    if (this.corkGroup) list.push(this.corkGroup);
    return list;
  }

  /**
   * 释放所有 3D 资源
   */
  public dispose(): void {
    this.pulseTimers.forEach(timer => clearTimeout(timer));
    this.pulseTimers.clear();
    disposeObjectTree(this.group);
  }
}

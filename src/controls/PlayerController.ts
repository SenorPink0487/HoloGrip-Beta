import * as THREE from 'three';
import { LAB_ENTRY_REST } from './labEntry.ts';
import { HOLO_TABLE_CLEARANCE } from '../scene/HoloTable.ts';
import { blurActiveInput, isTextInputActive, isTextInputElement, isElementVisibleAndActive } from '../core/focus.ts';

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public domElement: HTMLElement;

  public keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    sprint: false,
  };

  public yaw: number = LAB_ENTRY_REST.yaw;
  public pitch: number = LAB_ENTRY_REST.pitch;
  public targetYaw: number = LAB_ENTRY_REST.yaw;
  public targetPitch: number = LAB_ENTRY_REST.pitch;
  public rotationDamping = 20.0; // 舒适平滑阻尼系数，消除输入阶跃感，提供 60 FPS 顺滑转动
  public minPitch = -Math.PI / 2.1;
  public maxPitch = Math.PI / 2.1;

  public velocity = new THREE.Vector3();
  public direction = new THREE.Vector3();
  public moveSpeed = 3.8;
  public verticalSpeed = 3.0;
  public sprintMultiplier = 1.7;
  public damping = 9.0;
  public eyeHeight: number = LAB_ENTRY_REST.y;
  public minHeight = 0.3;
  public maxHeight = 3.55;

  public roomRadius = 7.6;
  public tableRadius = HOLO_TABLE_CLEARANCE;
  public tableCenter = new THREE.Vector2(0, 0);

  public isLocked = false;
  public enabled = true;
  public allowMouseRotation = true; // 默认允许鼠标转动视角与指针锁定；当手势追踪启动时动态禁用
  private _allowPointerLock = true;

  public get allowPointerLock(): boolean {
    return this._allowPointerLock;
  }

  public set allowPointerLock(val: boolean) {
    this._allowPointerLock = val;
    if (!val) {
      this.exitLock();
    }
  }

  public onLockChange?: (isLocked: boolean) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    // 实验室视角（位于实验台前）：上方为天球顶，圆盘居中，地面在前景。
    this.yaw = LAB_ENTRY_REST.yaw;
    this.pitch = LAB_ENTRY_REST.pitch;
    this.targetYaw = LAB_ENTRY_REST.yaw;
    this.targetPitch = LAB_ENTRY_REST.pitch;
    this.eyeHeight = LAB_ENTRY_REST.y;
    this.camera.position.set(LAB_ENTRY_REST.x, LAB_ENTRY_REST.y, LAB_ENTRY_REST.z);
    this.camera.rotation.order = 'YXZ';
    this.updateCameraRotation();

    this.initEvents();
  }

  public requestLock(): void {
    if (this.enabled && this.allowPointerLock && !this.isLocked) {
      blurActiveInput(true);
      try {
        this.domElement.requestPointerLock();
      } catch (err) {
        console.warn('[PlayerController] Pointer lock request error:', err);
      }
    }
  }

  public exitLock(): void {
    try {
      if (typeof document !== 'undefined' && typeof document.exitPointerLock === 'function') {
        document.exitPointerLock();
      }
    } catch (err) {
      console.warn('[PlayerController] Exit pointer lock error:', err);
    }
    this.isLocked = false;
    this.resetKeys();
  }

  public resetKeys(): void {
    this.keys.forward = false;
    this.keys.backward = false;
    this.keys.left = false;
    this.keys.right = false;
    this.keys.up = false;
    this.keys.down = false;
    this.keys.sprint = false;
  }

  private initEvents(): void {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let lastX = 0;
    let lastY = 0;
    let dragButton = 0;

    this.domElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    window.addEventListener('mousedown', (e) => {
      if (this.isLocked || !this.enabled) return;
      // 任意位置右键，或在画布上左键
      const isTargetCanvas = e.target === this.domElement || (typeof Node !== 'undefined' && e.target instanceof Node && this.domElement.contains(e.target));
      if (e.button === 2 || (e.button === 0 && isTargetCanvas)) {
        blurActiveInput(true);
        isDragging = true;
        dragButton = e.button;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isLocked && isDragging) {
        const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
        isDragging = false;
        // 若在画布上是单纯的左键点击（无拖拽）且允许指针锁定，则请求锁定指针
        const isTargetCanvas = e.target === this.domElement || (typeof Node !== 'undefined' && e.target instanceof Node && this.domElement.contains(e.target));
        if (dragButton === 0 && dist < 6 && isTargetCanvas) {
          if (this.enabled && this.allowPointerLock) {
            this.requestLock();
          }
        }
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      if (!this.isLocked) {
        this.resetKeys();
      }
      this.onLockChange?.(this.isLocked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.allowMouseRotation) return;

      if (this.isLocked) {
        const sensitivity = 0.0022;
        this.yaw -= e.movementX * sensitivity;
        this.pitch -= e.movementY * sensitivity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
        this.syncTargetRotation();
        this.updateCameraRotation();
      } else if (isDragging) {
        const sensitivity = 0.0028;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        this.yaw -= dx * sensitivity;
        this.pitch -= dy * sensitivity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
        this.syncTargetRotation();
        this.updateCameraRotation();
      }
    });

    window.addEventListener('blur', () => {
      this.resetKeys();
    });

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
  }

  public onKey(event: KeyboardEvent, isDown: boolean): void {
    if (!this.enabled) return;

    const target = event.target as HTMLElement | null;
    // 若用户正在有效且可见的文本输入框中输入，忽略玩家移动按键
    if (target && isTextInputElement(target)) {
      if (isElementVisibleAndActive(target) && !this.isLocked) {
        return;
      }
      // 目标为残留/隐藏的输入框，或玩家处于指针锁定状态 -> 立即取消聚焦
      blurActiveInput(true);
    } else if (isTextInputActive()) {
      return;
    }

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = isDown;
        if (event.cancelable) event.preventDefault?.();
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = isDown;
        if (event.cancelable) event.preventDefault?.();
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = isDown;
        if (event.cancelable) event.preventDefault?.();
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = isDown;
        if (event.cancelable) event.preventDefault?.();
        break;
      case 'Space':
        this.keys.up = isDown;
        if (event.cancelable) {
          event.preventDefault?.();
        }
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.down = isDown;
        break;
      default:
        if (event.key === ' ' || event.key === 'Spacebar') {
          this.keys.up = isDown;
          if (event.cancelable) {
            event.preventDefault?.();
          }
        } else if (event.key === 'Shift') {
          this.keys.down = isDown;
        }
        break;
    }
  }

  public syncTargetRotation(): void {
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
  }

  public updateCameraRotation(): void {
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.z = 0;
  }

  public rotate(dx: number, dy: number, sensitivity = 0.0028): void {
    if (!this.enabled) return;
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    this.syncTargetRotation();
    this.updateCameraRotation();
  }

  public rotateSmooth(dx: number, dy: number, sensitivity = 0.0028): void {
    if (!this.enabled) return;
    this.targetYaw -= dx * sensitivity;
    this.targetPitch -= dy * sensitivity;
    this.targetPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.targetPitch));
  }

  public update(delta: number): void {
    const dt = Math.min(delta, 0.1);

    // 平滑视角转动阻尼插值（在 60 FPS 渲染帧中平滑追赶目标视角，消除 24Hz 阶跃卡顿，平滑舒适且无需前向预测）
    if (Math.abs(this.targetYaw - this.yaw) > 1e-4 || Math.abs(this.targetPitch - this.pitch) > 1e-4) {
      const rotFactor = 1 - Math.exp(-this.rotationDamping * dt);
      this.yaw += (this.targetYaw - this.yaw) * rotFactor;
      this.pitch += (this.targetPitch - this.pitch) * rotFactor;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));

      if (Math.abs(this.targetYaw - this.yaw) < 0.0005) {
        this.yaw = this.targetYaw;
      }
      if (Math.abs(this.targetPitch - this.pitch) < 0.0005) {
        this.pitch = this.targetPitch;
      }
      this.updateCameraRotation();
    }

    this.velocity.x -= this.velocity.x * this.damping * dt;
    this.velocity.y -= this.velocity.y * this.damping * dt;
    this.velocity.z -= this.velocity.z * this.damping * dt;

    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    this.direction.set(0, 0, 0);

    if (this.keys.forward) {
      this.direction.x += forwardX;
      this.direction.z += forwardZ;
    }
    if (this.keys.backward) {
      this.direction.x -= forwardX;
      this.direction.z -= forwardZ;
    }
    if (this.keys.left) {
      this.direction.x -= rightX;
      this.direction.z -= rightZ;
    }
    if (this.keys.right) {
      this.direction.x += rightX;
      this.direction.z += rightZ;
    }

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      const speed = this.moveSpeed * (this.keys.sprint ? this.sprintMultiplier : 1.0);
      this.velocity.x += this.direction.x * speed * this.damping * dt;
      this.velocity.z += this.direction.z * speed * this.damping * dt;
    }

    // 垂直升降移动（空格 = 上升，Shift = 下降）
    let dirY = 0;
    if (this.keys.up) dirY += 1;
    if (this.keys.down) dirY -= 1;

    if (dirY !== 0) {
      const vSpeed = this.verticalSpeed * (this.keys.sprint ? this.sprintMultiplier : 1.0);
      this.velocity.y += dirY * vSpeed * this.damping * dt;
    }

    let newX = this.camera.position.x + this.velocity.x * dt;
    let newY = this.camera.position.y + this.velocity.y * dt;
    let newZ = this.camera.position.z + this.velocity.z * dt;

    // 空间边界约束
    const distFromOrigin = Math.hypot(newX, newZ);
    if (distFromOrigin > this.roomRadius) {
      const angle = Math.atan2(newZ, newX);
      newX = Math.cos(angle) * this.roomRadius;
      newZ = Math.sin(angle) * this.roomRadius;
    }

    const distFromTable = Math.hypot(newX - this.tableCenter.x, newZ - this.tableCenter.y);
    if (distFromTable < this.tableRadius) {
      const angle = Math.atan2(newZ - this.tableCenter.y, newX - this.tableCenter.x);
      newX = this.tableCenter.x + Math.cos(angle) * this.tableRadius;
      newZ = this.tableCenter.y + Math.sin(angle) * this.tableRadius;
    }

    // 垂直高度边界约束
    if (newY < this.minHeight) {
      newY = this.minHeight;
      if (this.velocity.y < 0) this.velocity.y = 0;
    } else if (newY > this.maxHeight) {
      newY = this.maxHeight;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }

    this.camera.position.x = newX;
    this.camera.position.y = newY;
    this.camera.position.z = newZ;
    this.eyeHeight = newY;
  }
}

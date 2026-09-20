import * as THREE from 'three';

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

  public yaw = 0;
  public pitch = -0.20;
  public minPitch = -Math.PI / 2.1;
  public maxPitch = Math.PI / 2.1;

  public velocity = new THREE.Vector3();
  public direction = new THREE.Vector3();
  public moveSpeed = 3.8;
  public verticalSpeed = 3.0;
  public sprintMultiplier = 1.7;
  public damping = 9.0;
  public eyeHeight = 1.38;
  public minHeight = 0.3;
  public maxHeight = 4.0;

  public roomRadius = 7.6;
  public tableRadius = 2.25;
  public tableCenter = new THREE.Vector2(0, 0);

  public isLocked = false;
  public enabled = true;
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

    // Position player right at the edge of the HoloTable for natural, interactive arm's length observation
    this.pitch = -0.28;
    this.camera.position.set(0, 1.38, 2.32);
    this.camera.rotation.order = 'YXZ';
    this.updateCameraRotation();

    this.initEvents();
  }

  public requestLock(): void {
    if (this.enabled && this.allowPointerLock && !this.isLocked) {
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
      // Right-click anywhere, or left-click on canvas
      if (e.button === 2 || (e.button === 0 && e.target === this.domElement)) {
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
        // If it was a clean left click on canvas without dragging and pointer lock is allowed, lock pointer
        if (dragButton === 0 && dist < 6 && e.target === this.domElement) {
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
      if (!this.enabled) return;

      if (this.isLocked) {
        const sensitivity = 0.0022;
        this.yaw -= e.movementX * sensitivity;
        this.pitch -= e.movementY * sensitivity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
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
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = isDown;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = isDown;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = isDown;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = isDown;
        break;
      case 'Space':
        this.keys.up = isDown;
        if (event.cancelable) {
          event.preventDefault();
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
            event.preventDefault();
          }
        } else if (event.key === 'Shift') {
          this.keys.down = isDown;
        }
        break;
    }
  }

  public updateCameraRotation(): void {
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.z = 0;
  }

  public update(delta: number): void {
    const dt = Math.min(delta, 0.1);

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

    // Vertical elevation movement (Space = ascend, Shift = descend)
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

    // Boundary constraints
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

    // Vertical boundary constraints
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

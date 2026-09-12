import * as THREE from 'three';
import { PlayerController } from './PlayerController';
import { TouchController } from './TouchController';

export class InputManager {
  public player: PlayerController;
  public touch: TouchController | null = null;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.player = new PlayerController(camera, domElement);

    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
      this.touch = new TouchController(this.player);
    }
  }

  public update(delta: number): void {
    this.player.update(delta);
  }

  public setEnabled(enabled: boolean): void {
    this.player.enabled = enabled;
  }
}

import './whiteboard.css';
import { WhiteboardConnection } from './WhiteboardConnection.ts';
import { restoreSession } from '../account/api.ts';
import { WhiteboardCanvas } from './WhiteboardCanvas.ts';
import { WhiteboardToolbar } from './WhiteboardToolbar.ts';
import { WhiteboardDock } from './WhiteboardDock.ts';
import { AccountModal } from './AccountModal.ts';
import type { Engine } from '../core/Engine.ts';
import { blurActiveInput, isTextInputActive } from '../core/focus.ts';
import { glassLook, glassMask } from '../controls/labEntry.ts';
import {
  returnChrome,
  returnCoverRadius,
  returnMask,
  returnStartRadius,
  sheetEase,
} from '../controls/labReturn.ts';

export interface WhiteboardAppOptions {
  engine?: Engine;
  onEnterLab?: () => void;
  onReturnWhiteboard?: () => void;
}

export class WhiteboardApp {
  public root: HTMLDivElement;
  public canvas: WhiteboardCanvas;
  public toolbar: WhiteboardToolbar;
  public dock: WhiteboardDock;
  public accountModal: AccountModal;

  private collaboration: WhiteboardConnection;
  private engine?: Engine;
  private currentMode: 'whiteboard' | 'laboratory' = 'whiteboard';
  private callbacks: WhiteboardAppOptions;
  private labEntryToken = 0;
  private labEntryCleanup = 0;
  private transitionKind: 'enter' | 'return' | null = null;
  private returnBtn!: HTMLButtonElement;
  private returnOriginX = 40;
  private returnOriginY = 36;
  private returnStart = 28;
  private returnCover = 2000;

  constructor(options: WhiteboardAppOptions = {}) {
    this.callbacks = options;
    this.engine = options.engine;

    this.initDOM();
    this.initComponents();
    this.setupViewMode();
  }

  private initDOM(): void {
    this.root = document.createElement('div');
    this.root.id = 'whiteboard-app-root';
    document.body.appendChild(this.root);
  }

  private initComponents(): void {
    // 1. Canvas Layer (Draw engine & pages)
    this.canvas = new WhiteboardCanvas(this.root, {
      initialTheme: 'plain',
      defaultColor: '#1c1c1e',
      defaultWidth: 4,
      onPageChange: () => {
        this.toolbar?.updatePaginationUI();
        this.accountModal?.updateStats();
      },
    });

    // 2. Left Sidebar (Color, thickness, tools, pagination)
    this.toolbar = new WhiteboardToolbar(this.canvas, this.root);

    // 3. Bottom Dock Bar (Laboratory toggle & Account page trigger)
    this.dock = new WhiteboardDock(document.body, {
      onEnterLab: () => {
        this.switchToLab();
      },
      onReturnWhiteboard: () => {
        this.switchToWhiteboard();
      },
      onOpenAccount: () => {
        this.accountModal.open();
      },
    });

    this.returnBtn = document.createElement('button');
    this.returnBtn.id = 'lab-return-btn';
    this.returnBtn.className = 'lab-return-btn';
    this.returnBtn.type = 'button';
    this.returnBtn.title = '返回白板';
    this.returnBtn.setAttribute('aria-label', '返回白板');
    this.returnBtn.setAttribute('aria-hidden', 'true');
    this.returnBtn.tabIndex = -1;
    this.returnBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 6l-6 6 6 6"/>
      </svg>
      <span>返回</span>
    `;
    this.returnBtn.addEventListener('click', () => this.switchToWhiteboard());
    document.body.appendChild(this.returnBtn);

    // 4. Account Modal. Logged-out clicks open login / register.
    this.accountModal = new AccountModal(this.canvas, document.body);
    this.collaboration = new WhiteboardConnection(this.canvas, this.root);
    window.addEventListener('pagehide', () => this.collaboration.dispose());
    window.addEventListener('pageshow', event => {
      if (event.persisted) this.collaboration = new WhiteboardConnection(this.canvas, this.root);
    });
    void restoreSession();

    // Shortcut to return to whiteboard from laboratory mode: KeyB
    window.addEventListener('keydown', (e) => {
      if (
        e.code === 'KeyB' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !isTextInputActive()
      ) {
        if (this.currentMode === 'laboratory') {
          this.switchToWhiteboard();
        }
      }
    });
  }

  private setupViewMode(): void {
    // Default mode is Whiteboard upon platform launch!
    this.applyViewMode('whiteboard');
  }

  public switchToLab(): void {
    if (this.currentMode === 'laboratory' || this.transitionKind !== null) return;
    this.callbacks.onEnterLab?.();
    if (this.engine && !this.prefersReducedMotion()) {
      this.playLabEntry();
      return;
    }
    this.applyViewMode('laboratory');
  }

  public switchToWhiteboard(): void {
    if (this.transitionKind === 'return') return;
    const inLab = this.currentMode === 'laboratory';
    if (!inLab && this.transitionKind !== 'enter') return;
    const interrupting = this.transitionKind === 'enter';
    this.transitionKind = 'return';
    this.callbacks.onReturnWhiteboard?.();
    if (!this.engine || this.prefersReducedMotion()) {
      this.cancelLabEntryPresentation();
      this.applyViewMode('whiteboard');
      return;
    }
    this.playLabReturn(interrupting);
  }

  private prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private playLabEntry(): void {
    const engine = this.engine;
    if (!engine) {
      this.applyViewMode('laboratory');
      return;
    }

    const token = ++this.labEntryToken;
    this.transitionKind = 'enter';
    this.setReturnButtonVisible(false);
    this.currentMode = 'laboratory';
    this.toolbar.colorPicker.close();
    this.paintLabEntry(0);
    this.root.classList.remove('hidden-view');
    this.root.classList.add('lab-entry');

    const player = engine.inputManager?.player;
    if (player) {
      player.exitLock();
      player.allowPointerLock = false;
      player.enabled = false;
    }
    engine.crosshair?.setVisible(false);
    engine.onLabEntryFrame = (frame) => {
      if (token !== this.labEntryToken) return;
      this.paintLabEntry(frame.linear);
      if (frame.done) this.finishLabEntry(token);
    };
    engine.beginLabEntry();
    engine.setViewMode('laboratory');
    engine.crosshair?.setVisible(false);
  }

  private finishLabEntry(token: number): void {
    if (token !== this.labEntryToken) return;
    this.transitionKind = null;
    this.dock.setMode('laboratory');
    this.root.classList.add('hidden-view');
    this.activateLaboratory();
    this.setReturnButtonVisible(true);
    this.engine?.handTrackingHUD?.setVisible(true);
    this.labEntryCleanup = requestAnimationFrame(() => {
      if (token !== this.labEntryToken) return;
      this.root.classList.remove('lab-entry');
      this.clearLabEntryPaint();
    });
  }

  private playLabReturn(interrupting = false): void {
    const engine = this.engine;
    if (!engine) {
      this.applyViewMode('whiteboard');
      return;
    }

    const covered = interrupting ? glassLook(engine.getLabTransitionLinear()).fill : 0;
    this.clearScheduledEntryCleanup();
    engine.suspendLabMotion();

    const token = ++this.labEntryToken;
    this.transitionKind = 'return';
    this.currentMode = 'whiteboard';
    this.setReturnButtonVisible(false);
    this.engine?.holoStage?.setViewMode('whiteboard');
    this.engine?.handTrackingHUD?.setVisible(false);
    this.measureReturnOrigin();
    this.returnCover = returnCoverRadius(window.innerWidth, window.innerHeight, this.returnOriginX, this.returnOriginY);
    this.returnStart = returnStartRadius(covered, this.returnCover);

    this.clearLabEntryPaint();
    this.root.classList.remove('hidden-view', 'lab-entry');
    this.root.classList.add('lab-return');
    document.body.classList.add('lab-returning');
    this.paintLabReturn(0);
    this.dock.setMode('whiteboard');
    this.canvas.resize();

    const player = engine.inputManager?.player;
    if (player) {
      player.exitLock();
      player.allowPointerLock = false;
      player.enabled = false;
    }
    engine.crosshair?.setVisible(false);
    engine.onLabEntryFrame = (frame) => {
      if (token !== this.labEntryToken) return;
      this.paintLabReturn(frame.linear);
      if (frame.done) this.finishLabReturn(token);
    };
    engine.beginLabReturn();
  }

  private finishLabReturn(token: number): void {
    if (token !== this.labEntryToken) return;
    this.transitionKind = null;
    this.currentMode = 'whiteboard';
    this.root.classList.remove('lab-return', 'lab-entry', 'hidden-view');
    this.clearLabReturnPaint();
    this.clearLabEntryPaint();
    this.dock.setMode('whiteboard');
    this.setReturnButtonVisible(false);
    this.showWhiteboardControls();
    setTimeout(() => this.canvas.resize(), 50);
  }

  private measureReturnOrigin(): void {
    const rect = this.returnBtn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.returnOriginX = rect.left + rect.width / 2;
      this.returnOriginY = rect.top + rect.height / 2;
      return;
    }
    this.returnOriginX = 40;
    this.returnOriginY = 36;
  }

  private paintLabReturn(linear: number): void {
    const radius = this.returnStart + (this.returnCover - this.returnStart) * sheetEase(linear);
    const chrome = returnChrome(linear).toFixed(4);
    const style = document.documentElement.style;
    style.setProperty('--return-mask', returnMask(this.returnOriginX, this.returnOriginY, radius));
    style.setProperty('--return-chrome', chrome);
    style.setProperty('--return-dock', chrome);
  }

  private clearLabReturnPaint(): void {
    const style = document.documentElement.style;
    style.removeProperty('--return-mask');
    style.removeProperty('--return-chrome');
    style.removeProperty('--return-dock');
    document.body.classList.remove('lab-returning');
  }

  private setReturnButtonVisible(visible: boolean): void {
    document.body.classList.toggle('lab-active', visible);
    this.returnBtn.setAttribute('aria-hidden', visible ? 'false' : 'true');
    this.returnBtn.tabIndex = visible ? 0 : -1;
  }

  private clearScheduledEntryCleanup(): void {
    if (this.labEntryCleanup) {
      cancelAnimationFrame(this.labEntryCleanup);
      this.labEntryCleanup = 0;
    }
  }

  private showWhiteboardControls(): void {
    if (!this.engine) return;
    if (this.engine.inputManager?.player) {
      this.engine.inputManager.player.exitLock();
      this.engine.inputManager.player.allowPointerLock = false;
      this.engine.inputManager.player.enabled = false;
    }
    this.engine.crosshair?.setVisible(false);
    this.engine.setViewMode('whiteboard');
  }

  private cancelLabEntryPresentation(): void {
    this.labEntryToken += 1;
    this.transitionKind = null;
    this.clearScheduledEntryCleanup();
    this.engine?.cancelLabEntry();
    this.root.classList.remove('lab-entry', 'lab-return');
    this.clearLabEntryPaint();
    this.clearLabReturnPaint();
    this.setReturnButtonVisible(false);
  }

  private paintLabEntry(linear: number): void {
    const look = glassLook(linear);
    const style = document.documentElement.style;
    style.setProperty('--glass-fill', look.fill.toFixed(4));
    style.setProperty('--glass-blur', `${look.blur.toFixed(2)}px`);
    style.setProperty('--dot-opacity', look.dots.toFixed(4));
    style.setProperty('--glass-sat', look.saturate.toFixed(3));
    style.setProperty('--ink-opacity', look.ink.toFixed(4));
    style.setProperty('--chrome-opacity', look.chrome.toFixed(4));
    style.setProperty('--sheen-opacity', look.sheen.toFixed(4));
    style.setProperty('--sheen-x', look.sheenX.toFixed(4));
    style.setProperty('--glass-mask', glassMask(look.aperture));
    document.body.classList.add('lab-entering');
  }

  private clearLabEntryPaint(): void {
    const style = document.documentElement.style;
    for (const name of [
      '--glass-fill',
      '--glass-blur',
      '--dot-opacity',
      '--glass-sat',
      '--ink-opacity',
      '--chrome-opacity',
      '--sheen-opacity',
      '--sheen-x',
      '--glass-mask',
    ]) {
      style.removeProperty(name);
    }
    document.body.classList.remove('lab-entering');
  }

  private activateLaboratory(): void {
    blurActiveInput(true);
    if (!this.engine) return;
    if (this.engine.inputManager?.player) {
      this.engine.inputManager.player.enabled = true;
      this.engine.inputManager.player.allowPointerLock = true;
    }
    if (this.engine.crosshair) {
      const isModalOpen = this.engine.visionModal?.visible ?? false;
      const isDrawerOpen = this.engine.hud?.drawer?.open ?? false;
      if (!isModalOpen && !isDrawerOpen) {
        this.engine.crosshair.setVisible(true);
      }
    }
  }

  private applyViewMode(mode: 'whiteboard' | 'laboratory'): void {
    blurActiveInput(true);
    this.currentMode = mode;
    this.dock.setMode(mode);

    if (mode === 'whiteboard') {
      // Whiteboard in focus
      this.setReturnButtonVisible(false);
      this.root.classList.remove('hidden-view');

      // Disable 3D pointer lock & scene navigation while drawing on whiteboard
      if (this.engine) {
        if (this.engine.inputManager?.player) {
          this.engine.inputManager.player.exitLock();
          this.engine.inputManager.player.allowPointerLock = false;
          this.engine.inputManager.player.enabled = false;
        }
        if (this.engine.crosshair) {
          this.engine.crosshair.setVisible(false);
        }
        this.engine.setViewMode('whiteboard');
      }

      // Ensure performance HUD overlay remains visible in top-left corner
      const perfOverlay = document.getElementById('perf-overlay');
      if (perfOverlay) {
        perfOverlay.style.display = '';
      }

      // Re-render canvas in case of DPI/container change
      setTimeout(() => {
        this.canvas.resize();
        const overlay = document.getElementById('perf-overlay');
        if (overlay) {
          overlay.style.display = '';
        }
      }, 50);
    } else {
      // Laboratory in focus
      this.setReturnButtonVisible(true);
      this.root.classList.add('hidden-view');

      const perfOverlay = document.getElementById('perf-overlay');
      if (perfOverlay) {
        perfOverlay.style.display = '';
      }

      // Enable 3D laboratory controls
      this.activateLaboratory();
      if (this.engine) {
        this.engine.setViewMode('laboratory');
      }
    }
  }

  public getMode(): 'whiteboard' | 'laboratory' {
    return this.currentMode;
  }

  public setEngine(engine: Engine): void {
    this.engine = engine;
    this.applyViewMode(this.currentMode);
  }
}

import './whiteboard.css';
import { WhiteboardConnection } from './WhiteboardConnection.ts';
import { restoreSession } from '../account/api.ts';
import { WhiteboardCanvas } from './WhiteboardCanvas.ts';
import { WhiteboardToolbar } from './WhiteboardToolbar.ts';
import { WhiteboardDock } from './WhiteboardDock.ts';
import { AccountModal } from './AccountModal.ts';
import type { Engine } from '../core/Engine.ts';

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
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
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
    this.applyViewMode('laboratory');
    this.callbacks.onEnterLab?.();
  }

  public switchToWhiteboard(): void {
    this.applyViewMode('whiteboard');
    this.callbacks.onReturnWhiteboard?.();
  }

  private applyViewMode(mode: 'whiteboard' | 'laboratory'): void {
    this.currentMode = mode;
    this.dock.setMode(mode);

    if (mode === 'whiteboard') {
      // Whiteboard in focus
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
      this.root.classList.add('hidden-view');

      const perfOverlay = document.getElementById('perf-overlay');
      if (perfOverlay) {
        perfOverlay.style.display = '';
      }

      // Enable 3D laboratory controls
      if (this.engine) {
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

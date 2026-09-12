import type { PlatformInfo, PlatformType } from '../types';

export class PlatformBridge {
  private static instance: PlatformBridge;
  private platformInfo: PlatformInfo;

  private constructor() {
    this.platformInfo = this.detectPlatform();
    this.fetchSystemInfo();
  }

  public static getInstance(): PlatformBridge {
    if (!PlatformBridge.instance) {
      PlatformBridge.instance = new PlatformBridge();
    }
    return PlatformBridge.instance;
  }

  public get info(): PlatformInfo {
    return this.platformInfo;
  }

  private detectPlatform(): PlatformInfo {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;

    const isIPad =
      /iPad/i.test(ua) ||
      (/Macintosh/i.test(ua) && maxTouchPoints > 1); // iPadOS reports as Macintosh with touch

    const isIPhone = /iPhone/i.test(ua);
    const isIOS = isIPad || isIPhone;
    const isMac = /Macintosh/i.test(ua) && !isIPad;
    const isAndroid = /Android/i.test(ua);
    const isWindows = /Windows/i.test(ua);
    const isMobile = isIOS || isAndroid || maxTouchPoints > 0;

    let platform: PlatformType = 'web';
    if (isIPad) platform = 'ipados';
    else if (isIPhone) platform = 'ios';
    else if (isMac) platform = 'macos';
    else if (isWindows) platform = 'windows';
    else if (isAndroid) platform = 'android';

    const logicalCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

    return {
      platform,
      isTauri,
      isMobile,
      logicalCores,
      backendName: isTauri ? 'Tauri 2 Native (Rayon)' : 'Web Worker Multi-Core Pool',
      os: platform,
      arch: 'unknown',
    };
  }

  private async fetchSystemInfo(): Promise<void> {
    if (this.platformInfo.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const sysInfo: any = await invoke('get_system_info');
        if (sysInfo) {
          this.platformInfo.os = sysInfo.os;
          this.platformInfo.arch = sysInfo.arch;
          this.platformInfo.logicalCores = sysInfo.logical_cores;
          this.platformInfo.backendName = sysInfo.backend;
          console.log('[PlatformBridge] Tauri Native Backend Active:', sysInfo);
        }
      } catch (err) {
        console.warn('[PlatformBridge] Failed to invoke Tauri get_system_info:', err);
      }
    } else {
      console.log('[PlatformBridge] Web-First Mode Active (Hardware Cores:', this.platformInfo.logicalCores, ')');
    }
  }

  public async toggleFullscreen(): Promise<void> {
    if (this.platformInfo.isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();
        const isFullscreen = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!isFullscreen);
        return;
      } catch (err) {
        console.warn('[PlatformBridge] Tauri fullscreen failed, falling back to Web API:', err);
      }
    }

    // Standard Web Fullscreen
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
}

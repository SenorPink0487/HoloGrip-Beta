export class StereometryGuidanceBar {
  constructor(_parent?: HTMLElement) {}
  public setHint(_hint: string, _type?: string, _colorHex?: number): void {}
  public showSuccess(_msg: string): void {}
  public showWarn(_msg: string): void {}
  public showInfo(_msg: string): void {}
  public setVisible(_visible: boolean): void {}
  public getVisible(): boolean { return false; }
  public destroy(): void {}
}

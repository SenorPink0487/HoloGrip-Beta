import { STANDARD_GRAVITY } from './constants.ts';

export type PulleyMode = 'fixed' | 'double' | 'quad';
export interface LeverWeight { massKg: number; slot: number | null }
export const LEVER_HALF_LENGTH = 0.45;
export const LEVER_HEIGHT = 0.53;
export const LEVER_MAX_ANGLE = 0.28;
export const PULLEY_MAX_LIFT = 0.105;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** SI units. Balanced beam includes its own mass; pulley uses a massless,
 * inextensible rope and frictionless, massless sheaves (quasi-static hand pull). */
export class LeverPulleyDynamics {
  public readonly beamMassKg = 0.12;
  public pivot = 0;
  public angle = 0;
  public angularVelocity = 0;
  public weights: LeverWeight[] = [];
  public mode: PulleyMode = 'double';
  public loadKg = 0.2;
  public lift = 0;
  public liftVelocity = 0;
  public pulling = false;
  public tension = 0;

  constructor() { this.reset(); }

  public get strands(): number { return this.mode === 'fixed' ? 1 : this.mode === 'double' ? 2 : 4; }
  public get pullDistance(): number { return this.strands * this.lift; }
  public get holdingForce(): number { return this.loadKg * STANDARD_GRAVITY / this.strands; }
  public get outputWork(): number { return this.loadKg * STANDARD_GRAVITY * this.lift; }

  /** Horizontal moment arms, including the small distance below the axle. */
  public get moments(): { left: number; right: number; net: number } {
    let left = 0, right = 0;
    const add = (mass: number, x: number, drop: number) => {
      const arm = (x - this.pivot) * Math.cos(this.angle) + drop * Math.sin(this.angle);
      const moment = mass * STANDARD_GRAVITY * arm;
      if (moment < 0) left -= moment; else right += moment;
    };
    add(this.beamMassKg, 0, 0.014);
    for (const w of this.weights) if (w.slot !== null) add(w.massKg, w.slot, 0.023);
    return { left, right, net: left - right };
  }

  public setPivot(x: number): void {
    if (!Number.isFinite(x)) return;
    const next = clamp(Math.round(x / 0.025) * 0.025, -0.15, 0.15);
    if (!this.weights.some(w => w.slot !== null && Math.abs(w.slot - next) < 0.045)) this.pivot = next;
  }

  /** One hanger per 5 cm hole. Occupied holes and the bearing are excluded. */
  public nearestSlot(x: number): number | null {
    if (!Number.isFinite(x)) return null;
    const slot = clamp(Math.round(x / 0.05) * 0.05, -LEVER_HALF_LENGTH, LEVER_HALF_LENGTH);
    if (Math.abs(slot - this.pivot) < 0.045 || this.weights.some(w => w.slot !== null && Math.abs(w.slot - slot) < 0.001)) return null;
    return slot;
  }

  public hangWeight(index: number, slot: number | null): boolean {
    const weight = this.weights[index];
    if (!weight) return false;
    if (slot === null) { weight.slot = null; return true; }
    if (!Number.isFinite(slot) || Math.abs(slot) > LEVER_HALF_LENGTH + 1e-6 ||
      Math.abs(slot / 0.05 - Math.round(slot / 0.05)) > 1e-6 ||
      Math.abs(slot - this.pivot) < 0.045 ||
      this.weights.some((w, i) => i !== index && w.slot !== null && Math.abs(w.slot - slot) < 0.001)) return false;
    weight.slot = slot;
    return true;
  }

  public setMode(mode: PulleyMode): void {
    if (!['fixed', 'double', 'quad'].includes(mode)) return;
    this.mode = mode;
    this.releasePull();
    this.lift = 0;
  }

  public setLoad(kg: number): void {
    if (!Number.isFinite(kg)) return;
    this.loadKg = clamp(kg, 0.05, 0.5);
    if (this.pulling) this.tension = this.holdingForce;
  }

  public pullTo(distance: number): void {
    if (!Number.isFinite(distance)) return;
    this.pulling = true;
    this.lift = clamp(distance / this.strands, 0, PULLEY_MAX_LIFT);
    this.liftVelocity = 0;
    this.tension = this.holdingForce;
  }

  public releasePull(): void {
    this.pulling = false;
    this.tension = 0;
    this.liftVelocity = 0;
  }

  public update(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const duration = Math.min(delta, 0.1);
    const steps = Math.ceil(duration / (1 / 240));
    const dt = duration / steps;
    for (let i = 0; i < steps; i++) {
      let inertia = this.beamMassKg * (0.98 ** 2 / 12 + this.pivot ** 2 + 0.014 ** 2);
      for (const w of this.weights) if (w.slot !== null) inertia += w.massKg * ((w.slot - this.pivot) ** 2 + 0.023 ** 2);
      this.angularVelocity += (this.moments.net - 0.055 * this.angularVelocity) / inertia * dt;
      this.angle += this.angularVelocity * dt;
      if (Math.abs(this.angle) > LEVER_MAX_ANGLE) {
        this.angle = clamp(this.angle, -LEVER_MAX_ANGLE, LEVER_MAX_ANGLE);
        this.angularVelocity = 0;
      }
      if (!this.pulling && this.lift > 0) {
        this.liftVelocity -= STANDARD_GRAVITY * dt;
        this.lift = Math.max(0, this.lift + this.liftVelocity * dt);
        if (this.lift === 0) this.liftVelocity = 0; // cushioned bottom stop
      }
    }
  }

  public reset(): void {
    this.pivot = this.angle = this.angularVelocity = 0;
    this.weights = [
      { massKg: 0.1, slot: -0.3 }, { massKg: 0.1, slot: 0.3 },
      { massKg: 0.05, slot: null }, { massKg: 0.05, slot: null },
      { massKg: 0.2, slot: null }, { massKg: 0.2, slot: null },
    ];
    this.mode = 'double';
    this.loadKg = 0.2;
    this.lift = 0;
    this.releasePull();
  }
}

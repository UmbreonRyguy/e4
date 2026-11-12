import Phaser from "phaser";
import type { Rng } from "./rng.ts";
import type { EnemyKind } from "./route.ts";

export const WIDTH = 480;
export const HEIGHT = 640;

export interface Arena {
  readonly rng: Rng;
  readonly player: Player;
  readonly now: number;
  fire(
    x: number,
    y: number,
    angle: number,
    speed: number,
    heavy?: boolean,
  ): void;
  summon(kind: string, x: number, y: number): void;
}
export abstract class Actor extends Phaser.GameObjects.Image {
  age = 0;
  vx = 0;
  vy = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    readonly radius: number,
  ) {
    super(scene, x, y, texture);
    scene.add.existing(this);
  }

  touches(other: Actor): boolean {
    const reach = this.radius + other.radius;
    return Phaser.Math.Distance.Squared(this.x, this.y, other.x, other.y) <
      reach * reach;
  }

  isOffscreen(margin = 60): boolean {
    return this.x < -margin || this.x > WIDTH + margin ||
      this.y < -margin * 3 ||
      this.y > HEIGHT + margin;
  }
}

export class Bullet extends Actor {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    radius: number,
    vx: number,
    vy: number,
    readonly damage = 1,
  ) {
    super(scene, x, y, texture, radius);
    this.vx = vx;
    this.vy = vy;
    this.setBlendMode(Phaser.BlendModes.ADD);
    this.rotation = Math.atan2(vy, vx) + Math.PI / 2;
  }

  step(): void {
    this.age++;
    this.x += this.vx;
    this.y += this.vy;
  }
}

export interface Controls {
  dx: number;
  dy: number;
  fire: boolean;
}

export const MAX_POWER = 3;
const SPEED = 4.2;
const RESPAWN_GRACE = 120;

export class Player extends Actor {
  power = 1;
  shielded = false;
  grace = 0;
  private cooldown = 0;
  readonly bubble: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    super(scene, WIDTH / 2, HEIGHT - 80, "player", 6);
    this.bubble = scene.add.image(this.x, this.y, "bubble").setVisible(false);
  }
  step(controls: Controls): { x: number; y: number; vx: number }[] {
    this.age++;
    this.grace = Math.max(0, this.grace - 1);
    this.x = Phaser.Math.Clamp(this.x + controls.dx * SPEED, 18, WIDTH - 18);
    this.y = Phaser.Math.Clamp(this.y + controls.dy * SPEED, 60, HEIGHT - 24);
    this.rotation = controls.dx * 0.18;
    this.alpha = this.grace > 0 && this.age % 8 < 4 ? 0.35 : 1;
    this.bubble.setPosition(this.x, this.y).setVisible(this.shielded);
    this.bubble.rotation += 0.05;

    this.cooldown = Math.max(0, this.cooldown - 1);
    if (!controls.fire || this.cooldown > 0) return [];
    this.cooldown = 7;
    const spreads = [[0], [-0.8, 0.8], [-1.6, 0, 1.6]][this.power - 1];
    return spreads.map((vx, i) => ({
      x: this.x + (i - (spreads.length - 1) / 2) * 9,
      y: this.y - 18,
      vx,
    }));
  }

  get vulnerable(): boolean {
    return this.grace === 0;
  }
  takeHit(): boolean {
    this.grace = RESPAWN_GRACE;
    if (this.shielded) {
      this.shielded = false;
      return false;
    }
    this.power = Math.max(1, this.power - 1);
    return true;
  }

  collect(kind: string): void {
    if (kind === "spread") this.power = Math.min(MAX_POWER, this.power + 1);
    if (kind === "shield") this.shielded = true;
  }

  override destroy(fromScene?: boolean): void {
    this.bubble.destroy(fromScene);
    super.destroy(fromScene);
  }
}

export interface Spawn {
  x: number;
  y: number;
  side?: number;
}

export interface EnemySpec {
  kind: EnemyKind | "boss";
  hp: number;
  score: number;
  radius: number;
  dropChance: number;
  move?: (enemy: Enemy, arena: Arena) => void;
  fire?: (enemy: Enemy, arena: Arena) => void;
}

function aim(from: { x: number; y: number }, arena: Arena): number {
  return Math.atan2(arena.player.y - from.y, arena.player.x - from.x);
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  drone: {
    kind: "drone",
    hp: 2,
    score: 100,
    radius: 13,
    dropChance: 0.015,
    move(e) {
      e.y += 1.5;
      e.x = e.homeX + Math.sin(e.age * 0.045) * 46 * e.side;
    },
    fire(e, arena) {
      if (e.age % 100 !== 60 || !arena.rng.chance(0.35)) return;
      arena.fire(e.x, e.y, aim(e, arena), 2.4);
    },
  },
  dart: {
    kind: "dart",
    hp: 1,
    score: 150,
    radius: 12,
    dropChance: 0.015,
    move(e, arena) {
      if (e.age < 50) {
        e.y += 1.2;
        return;
      }
      if (e.age === 50) e.heading = Math.sign(arena.player.x - e.x) * 1.4;
      e.y += 5.2;
      e.x += e.heading;
    },
  },
  turret: {
    kind: "turret",
    hp: 12,
    score: 400,
    radius: 19,
    dropChance: 0.3,
    move(e) {
      if (e.age < 70) e.y += 1.6;
      else if (e.age > 420) e.y += 1.2;
      e.rotation += 0.02;
    },
    fire(e, arena) {
      const t = e.age - 80;
      if (t < 0 || e.age > 420 || t % 100 > 40 || t % 8 !== 0) return;
      arena.fire(e.x, e.y, aim(e, arena), 3.4);
    },
  },
  lancer: {
    kind: "lancer",
    hp: 4,
    score: 250,
    radius: 15,
    dropChance: 0.06,
    move(e) {
      e.x += 2.4 * e.side;
      e.y += 0.35;
    },
    fire(e, arena) {
      if (e.age % 40 !== 20 || e.x < 20 || e.x > WIDTH - 20) return;
      for (const spread of [-0.25, 0, 0.25]) {
        arena.fire(e.x, e.y + 8, Math.PI / 2 + spread, 2.6);
      }
    },
  },
};

const BOSS: EnemySpec = {
  kind: "boss",
  hp: 900,
  score: 10000,
  radius: 46,
  dropChance: 0,
};

export class Enemy extends Actor {
  hp: number;
  homeX: number;
  side: number;
  flash = 0;
  heading = 0;

  constructor(
    scene: Phaser.Scene,
    readonly spec: EnemySpec,
    { x, y, side = 1 }: Spawn,
  ) {
    super(scene, x, y, spec.kind, spec.radius);
    this.hp = spec.hp;
    this.homeX = x;
    this.side = side;
  }

  step(arena: Arena): void {
    this.age++;
    const { x, y } = this;
    this.spec.move?.(this, arena);
    this.vx = this.x - x;
    this.vy = this.y - y;
    this.spec.fire?.(this, arena);
    this.flash = Math.max(0, this.flash - 1);
    if (this.flash > 0) {
      this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else this.clearTint();
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.flash = 3;
    return this.hp <= 0;
  }
}

export class Boss extends Enemy {
  readonly core: Phaser.GameObjects.Image;
  private spin = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, BOSS, { x: WIDTH / 2, y: -90 });
    this.core = scene.add.image(this.x, this.y, "boss-core").setBlendMode(
      Phaser.BlendModes.ADD,
    );
  }

  get fraction(): number {
    return this.hp / this.spec.hp;
  }

  phase(): number {
    return this.fraction > 2 / 3 ? 1 : this.fraction > 1 / 3 ? 2 : 3;
  }

  get arrived(): boolean {
    return this.age > 150;
  }

  override takeDamage(amount: number): boolean {
    return this.arrived ? super.takeDamage(amount) : false;
  }

  override step(arena: Arena): void {
    super.step(arena);
    if (!this.arrived) {
      this.y += 1.4;
    } else {
      const sway = this.phase() === 3 ? 0.012 : 0.008;
      this.x = WIDTH / 2 + Math.sin((this.age - 150) * sway) * 140;
      this.attack(arena, this.age - 150);
    }
    this.core.setPosition(this.x, this.y + 6);
    this.core.setScale(1 + 0.15 * Math.sin(this.age * (0.08 * this.phase())));
  }

  private attack(arena: Arena, t: number): void {
    if (this.phase() === 1 && t % 55 === 0) this.fan(arena, 9, 1.1, 2.8);
    if (this.phase() === 2) {
      if (t % 80 === 0) this.fan(arena, 9, 1.2, 3);
      if (t % 80 === 40) {
        for (const d of [-0.12, 0, 0.12]) {
          arena.fire(this.x, this.y + 30, aim(this, arena) + d, 4.2, true);
        }
      }
      if (t % 360 === 180) {
        arena.summon("drone", this.x - 70, this.y);
        arena.summon("drone", this.x + 70, this.y);
      }
    }
    if (this.phase() === 3 && t % 6 === 0) {
      this.spin += 0.23;
      for (let arm = 0; arm < 4; arm++) {
        arena.fire(this.x, this.y + 6, this.spin + (arm * Math.PI) / 2, 2.6);
      }
      if (t % 48 === 0) {
        arena.fire(this.x, this.y + 30, aim(this, arena), 4.6, true);
      }
    }
  }

  private fan(arena: Arena, count: number, width: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI / 2 + (i / (count - 1) - 0.5) * width;
      arena.fire(this.x, this.y + 40, angle, speed);
    }
  }

  override destroy(fromScene?: boolean): void {
    this.core.destroy(fromScene);
    super.destroy(fromScene);
  }
}

export type PowerUpKind = "spread" | "shield";
const POWER_UP_RADIUS = 14;

export class PowerUp extends Actor {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly kind: PowerUpKind,
  ) {
    super(scene, x, y, kind, POWER_UP_RADIUS);
  }

  step(): void {
    this.age++;
    this.y += 1.1;
    this.rotation += 0.04;
    this.setScale(1 + 0.12 * Math.sin(this.age * 0.15));
  }
}

import Phaser from "phaser";
import { HEIGHT, WIDTH } from "../actors.ts";

const FADE_RGB = [4, 2, 12] as const;
const FADE_IN_MS = 400;
const FADE_OUT_MS = 450;

export class Backdrop {
  warp = 1;
  private readonly layers: [Phaser.GameObjects.TileSprite, number][];
  private leaving = false;

  constructor(private readonly scene: Phaser.Scene) {
    const tile = (key: string, speed: number, alpha = 1) =>
      [
        scene.add.tileSprite(0, 0, WIDTH, HEIGHT, key).setOrigin(0).setAlpha(
          alpha,
        ),
        speed,
      ] as [Phaser.GameObjects.TileSprite, number];
    this.layers = [
      tile("nebula", 0.25, 0.9),
      tile("stars-far", 0.6),
      tile("stars-near", 1.6),
    ];
    const camera = scene.cameras.main;
    Phaser.Actions.AddEffectBloom(camera, {
      threshold: 0.55,
      blurRadius: 3,
      blendAmount: 0.9,
    });
    camera.filters.external.addVignette(0.5, 0.5, 0.75, 0.45);
  }

  fadeIn(ms = FADE_IN_MS): void {
    this.scene.cameras.main.fadeIn(ms, ...FADE_RGB);
  }

  get fadingOut(): boolean {
    return this.leaving;
  }

  fadeTo(key: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    const camera = this.scene.cameras.main;
    camera.fadeOut(FADE_OUT_MS, ...FADE_RGB);
    camera.once(
      "camerafadeoutcomplete",
      () => this.scene.scene.start(key, data),
    );
  }

  scroll(deltaMs: number): void {
    const frames = deltaMs / (1000 / 60);
    for (const [layer, speed] of this.layers) {
      layer.tilePositionY -= speed * this.warp * frames;
    }
  }
}

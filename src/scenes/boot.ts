import Phaser from "phaser";
import { loadSounds } from "../sounds.ts";
import { makeTextures } from "../textures.ts";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    makeTextures(this);
    loadSounds(this);
    this.scene.start("title");
  }
}

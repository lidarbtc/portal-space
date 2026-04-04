import Phaser from 'phaser';
import { WorldScene } from './scenes/world';

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    width: 640,
    height: 480,
    parent,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#1a1a2e',
    scene: [WorldScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  };
}

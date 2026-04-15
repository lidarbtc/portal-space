import Phaser from 'phaser'
import { WorldScene } from './scenes/world'

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
	return {
		type: Phaser.AUTO,
		parent,
		pixelArt: true,
		roundPixels: true,
		backgroundColor: '#1a1a2e',
		scene: [WorldScene],
		scale: {
			mode: Phaser.Scale.RESIZE,
			autoCenter: Phaser.Scale.CENTER_BOTH,
		},
	}
}

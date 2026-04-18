import Phaser from 'phaser'

export const CHARACTER_FRAME_SIZE = 32

// 'characters' 스프라이트시트를 gopher-src 원본에서 생성.
// 프레임 수는 원본 이미지 너비에 따라 자동 결정됨 (128×32 = 4프레임, 256×32 = 8프레임).
export function createAvatarSpritesheet(scene: Phaser.Scene): void {
	const fw = CHARACTER_FRAME_SIZE,
		fh = CHARACTER_FRAME_SIZE

	const gopherSource = scene.textures.get('gopher-src').getSourceImage() as HTMLImageElement
	const canvas = document.createElement('canvas')
	canvas.width = gopherSource.width
	canvas.height = fh
	const ctx = canvas.getContext('2d')!
	ctx.drawImage(gopherSource, 0, 0)

	scene.textures.addSpriteSheet('characters', canvas as unknown as HTMLImageElement, {
		frameWidth: fw,
		frameHeight: fh,
	})
}

// 'characters' 텍스처의 실제 프레임 수를 반환 (4 또는 8).
// Phaser 스프라이트시트는 '__BASE' 메타 프레임을 포함하므로 1을 뺌.
export function getCharacterFrameCount(scene: Phaser.Scene): number {
	const tex = scene.textures.get('characters')
	return Math.max(0, tex.frameTotal - 1)
}

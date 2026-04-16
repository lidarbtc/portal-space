import type Phaser from 'phaser'
import type { ColorPalette } from '$lib/types'

const SOURCE_COLORS = {
	body: { r: 0x80, g: 0xd3, b: 0xe1 },
	eye: { r: 0xff, g: 0xff, b: 0xff },
	foot: { r: 0xea, g: 0xcb, b: 0x9e },
} as const

export const DEFAULT_COLORS: ColorPalette = {
	body: '#80d3e1',
	eye: '#ffffff',
	foot: '#eacb9e',
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const n = parseInt(hex.slice(1), 16)
	return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

export function createTintedSpritesheet(
	scene: Phaser.Scene,
	textureKey: string,
	colors: ColorPalette,
): void {
	if (scene.textures.exists(textureKey)) {
		scene.textures.remove(textureKey)
	}

	const source = scene.textures.get('gopher-src').getSourceImage() as HTMLImageElement
	const canvas = document.createElement('canvas')
	canvas.width = source.width
	canvas.height = source.height
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	ctx.drawImage(source, 0, 0)

	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
	const data = imageData.data

	const targetBody = hexToRgb(colors.body)
	const targetEye = hexToRgb(colors.eye)
	const targetFoot = hexToRgb(colors.foot)

	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] === 0) continue

		const r = data[i],
			g = data[i + 1],
			b = data[i + 2]

		if (r === SOURCE_COLORS.body.r && g === SOURCE_COLORS.body.g && b === SOURCE_COLORS.body.b) {
			data[i] = targetBody.r
			data[i + 1] = targetBody.g
			data[i + 2] = targetBody.b
		} else if (
			r === SOURCE_COLORS.eye.r &&
			g === SOURCE_COLORS.eye.g &&
			b === SOURCE_COLORS.eye.b
		) {
			data[i] = targetEye.r
			data[i + 1] = targetEye.g
			data[i + 2] = targetEye.b
		} else if (
			r === SOURCE_COLORS.foot.r &&
			g === SOURCE_COLORS.foot.g &&
			b === SOURCE_COLORS.foot.b
		) {
			data[i] = targetFoot.r
			data[i + 1] = targetFoot.g
			data[i + 2] = targetFoot.b
		}
	}

	ctx.putImageData(imageData, 0, 0)
	scene.textures.addSpriteSheet(textureKey, canvas as unknown as HTMLImageElement, {
		frameWidth: 32,
		frameHeight: 32,
	})
}

export function createPreviewCanvas(
	canvas: HTMLCanvasElement,
	colors: ColorPalette,
	gopherImage: HTMLImageElement | null,
): void {
	const ctx = canvas.getContext('2d')
	if (!ctx || !gopherImage) return

	const w = canvas.width
	const h = canvas.height
	ctx.clearRect(0, 0, w, h)

	// Draw first frame (down-facing) of gopher scaled to canvas
	const tempCanvas = document.createElement('canvas')
	tempCanvas.width = 32
	tempCanvas.height = 32
	const tempCtx = tempCanvas.getContext('2d')!
	tempCtx.drawImage(gopherImage, 0, 0, 32, 32, 0, 0, 32, 32)

	const imageData = tempCtx.getImageData(0, 0, 32, 32)
	const data = imageData.data

	const targetBody = hexToRgb(colors.body)
	const targetEye = hexToRgb(colors.eye)
	const targetFoot = hexToRgb(colors.foot)

	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] === 0) continue

		const r = data[i],
			g = data[i + 1],
			b = data[i + 2]

		if (r === SOURCE_COLORS.body.r && g === SOURCE_COLORS.body.g && b === SOURCE_COLORS.body.b) {
			data[i] = targetBody.r
			data[i + 1] = targetBody.g
			data[i + 2] = targetBody.b
		} else if (
			r === SOURCE_COLORS.eye.r &&
			g === SOURCE_COLORS.eye.g &&
			b === SOURCE_COLORS.eye.b
		) {
			data[i] = targetEye.r
			data[i + 1] = targetEye.g
			data[i + 2] = targetEye.b
		} else if (
			r === SOURCE_COLORS.foot.r &&
			g === SOURCE_COLORS.foot.g &&
			b === SOURCE_COLORS.foot.b
		) {
			data[i] = targetFoot.r
			data[i + 1] = targetFoot.g
			data[i + 2] = targetFoot.b
		}
	}

	tempCtx.putImageData(imageData, 0, 0)

	ctx.imageSmoothingEnabled = false
	ctx.drawImage(tempCanvas, 0, 0, 32, 32, 0, 0, w, h)
}

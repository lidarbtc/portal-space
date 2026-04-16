import type { ColorPalette } from '@shared/types'

type RgbColor = { r: number; g: number; b: number }
type HslColor = { h: number; s: number; l: number }

const CHAT_BACKGROUND = '#101830'
const FALLBACK_NICKNAME_COLOR = '#88aaff'
const MIN_CONTRAST_RATIO = 4.5
const MIN_COLOR_DISTANCE = 110
const MIN_SATURATION = 55
const MIN_LIGHTNESS = 62
const MAX_LIGHTNESS = 80

export function resolveNicknameColor(playerId: string, palette?: ColorPalette): string {
	if (!playerId) return FALLBACK_NICKNAME_COLOR

	const sourceColor = parseHexColor(palette?.body)
	if (!sourceColor) {
		return buildFallbackColor(playerId)
	}

	return rgbToHex(makeReadable(sourceColor))
}

function buildFallbackColor(playerId: string): string {
	const hash = hashString(playerId)
	const hue = hash % 360
	const saturation = 64 + ((hash >> 8) % 18)
	const lightness = 68 + ((hash >> 16) % 8)
	return rgbToHex(makeReadable(hslToRgb({ h: hue, s: saturation, l: lightness })))
}

function makeReadable(rgb: RgbColor): RgbColor {
	const background = parseHexColor(CHAT_BACKGROUND)!
	const hsl = rgbToHsl(rgb)

	const adjusted: HslColor = {
		h: Number.isNaN(hsl.h) ? 210 : hsl.h,
		s: clamp(Math.max(hsl.s, MIN_SATURATION), MIN_SATURATION, 92),
		l: clamp(hsl.l, MIN_LIGHTNESS, MAX_LIGHTNESS),
	}

	let candidate = hslToRgb(adjusted)
	let attempts = 0

	while (
		attempts < 12 &&
		(contrastRatio(candidate, background) < MIN_CONTRAST_RATIO ||
			colorDistance(candidate, background) < MIN_COLOR_DISTANCE)
	) {
		adjusted.l = clamp(adjusted.l + 2, MIN_LIGHTNESS, 84)
		if (attempts % 4 === 3) {
			adjusted.s = clamp(adjusted.s + 4, MIN_SATURATION, 96)
		}
		candidate = hslToRgb(adjusted)
		attempts += 1
	}

	if (contrastRatio(candidate, background) < MIN_CONTRAST_RATIO) {
		candidate = hslToRgb({
			h: adjusted.h,
			s: clamp(Math.max(adjusted.s, 72), MIN_SATURATION, 96),
			l: 76,
		})
	}

	return candidate
}

function hashString(value: string): number {
	let hash = 2166136261
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return hash >>> 0
}

function parseHexColor(hex?: string | null): RgbColor | null {
	if (!hex) return null

	const normalized = hex.trim()
	if (!/^#([\da-f]{3}|[\da-f]{6})$/i.test(normalized)) {
		return null
	}

	const expanded =
		normalized.length === 4
			? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
			: normalized

	const value = Number.parseInt(expanded.slice(1), 16)
	return {
		r: (value >> 16) & 0xff,
		g: (value >> 8) & 0xff,
		b: value & 0xff,
	}
}

function rgbToHex({ r, g, b }: RgbColor): string {
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function toHex(channel: number): string {
	return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
	const red = r / 255
	const green = g / 255
	const blue = b / 255

	const max = Math.max(red, green, blue)
	const min = Math.min(red, green, blue)
	const delta = max - min

	let h = 0
	const l = (max + min) / 2
	const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))

	if (delta !== 0) {
		switch (max) {
			case red:
				h = 60 * (((green - blue) / delta) % 6)
				break
			case green:
				h = 60 * ((blue - red) / delta + 2)
				break
			default:
				h = 60 * ((red - green) / delta + 4)
				break
		}
	}

	return {
		h: h < 0 ? h + 360 : h,
		s: s * 100,
		l: l * 100,
	}
}

function hslToRgb({ h, s, l }: HslColor): RgbColor {
	const saturation = clamp(s, 0, 100) / 100
	const lightness = clamp(l, 0, 100) / 100
	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
	const huePrime = (((h % 360) + 360) % 360) / 60
	const x = chroma * (1 - Math.abs((huePrime % 2) - 1))

	let red = 0
	let green = 0
	let blue = 0

	if (huePrime >= 0 && huePrime < 1) {
		red = chroma
		green = x
	} else if (huePrime < 2) {
		red = x
		green = chroma
	} else if (huePrime < 3) {
		green = chroma
		blue = x
	} else if (huePrime < 4) {
		green = x
		blue = chroma
	} else if (huePrime < 5) {
		red = x
		blue = chroma
	} else {
		red = chroma
		blue = x
	}

	const match = lightness - chroma / 2
	return {
		r: Math.round((red + match) * 255),
		g: Math.round((green + match) * 255),
		b: Math.round((blue + match) * 255),
	}
}

function contrastRatio(a: RgbColor, b: RgbColor): number {
	const lighter = Math.max(relativeLuminance(a), relativeLuminance(b))
	const darker = Math.min(relativeLuminance(a), relativeLuminance(b))
	return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance({ r, g, b }: RgbColor): number {
	const [red, green, blue] = [r, g, b].map((value) => {
		const normalized = value / 255
		return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
	})

	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function colorDistance(a: RgbColor, b: RgbColor): number {
	return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

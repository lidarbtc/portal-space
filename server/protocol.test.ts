import { describe, it, expect } from 'bun:test'
import {
	sanitizeString,
	sanitizeNickname,
	sanitizeChat,
	sanitizeFileName,
	normalizeChatImage,
	validateMove,
	validateStatus,
	validateDirection,
	validateAvatar,
	validateEmoji,
	validateHexColor,
	validateColors,
	encodeUpdates,
	decodeUpdates,
	MAP_PIXEL_WIDTH,
	MAP_PIXEL_HEIGHT,
	MAX_CHAT_IMAGE_BASE64_LEN,
	MAX_CHAT_IMAGE_BYTES,
	MAX_INCOMING_WS_MESSAGE_BYTES,
} from './protocol'

function toBase64(bytes: number[]): string {
	return btoa(String.fromCharCode(...bytes))
}

describe('sanitizeString', () => {
	it('removes control characters except newline', () => {
		// \x00 is a control char → dropped, so "hello" and "world" merge
		expect(sanitizeString('hello\x00world\nok', 100)).toBe('helloworld\nok')
	})

	it('removes zero-width characters', () => {
		expect(sanitizeString('he\u200Bllo', 100)).toBe('hello')
		expect(sanitizeString('he\uFEFFllo', 100)).toBe('hello')
	})

	it('removes non-breaking spaces', () => {
		expect(sanitizeString('he\u00A0llo', 100)).toBe('hello')
	})

	it('trims whitespace', () => {
		expect(sanitizeString('  hello  ', 100)).toBe('hello')
	})

	it('truncates by rune count not byte count', () => {
		const emoji = '🎮'.repeat(10)
		expect(sanitizeString(emoji, 5)).toBe('🎮'.repeat(5))
	})

	it('handles empty string', () => {
		expect(sanitizeString('', 100)).toBe('')
	})
})

describe('sanitizeNickname', () => {
	it('limits to 20 characters', () => {
		expect(sanitizeNickname('a'.repeat(30))).toBe('a'.repeat(20))
	})
})

describe('sanitizeChat', () => {
	it('limits to 500 characters', () => {
		expect(sanitizeChat('a'.repeat(600))).toBe('a'.repeat(500))
	})
})

describe('sanitizeFileName', () => {
	it('removes slashes', () => {
		expect(sanitizeFileName('..\\folder/test.bin')).toBe('..foldertest.bin')
	})
})

describe('normalizeChatImage', () => {
	it('accepts PNG', () => {
		const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]
		const result = normalizeChatImage({
			mime: 'application/octet-stream',
			data: toBase64(png),
			size: 1,
			name: '..\\folder/test.bin',
		})
		expect(result).not.toBeNull()
		expect(result!.mime).toBe('image/png')
		expect(result!.size).toBe(png.length)
		expect(result!.name).toBe('..foldertest.bin')
	})

	it('accepts JPEG', () => {
		const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]
		const result = normalizeChatImage({
			mime: 'application/octet-stream',
			data: toBase64(jpeg),
			size: 1,
		})
		expect(result).not.toBeNull()
		expect(result!.mime).toBe('image/jpeg')
	})

	it('accepts GIF', () => {
		const gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]
		const result = normalizeChatImage({
			mime: 'application/octet-stream',
			data: toBase64(gif),
			size: 1,
		})
		expect(result).not.toBeNull()
		expect(result!.mime).toBe('image/gif')
	})

	it('accepts WebP', () => {
		const webp = [
			0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
			0x38, 0x20, 0x0a, 0x00, 0x00, 0x00,
		]
		const result = normalizeChatImage({
			mime: 'application/octet-stream',
			data: toBase64(webp),
			size: 1,
		})
		expect(result).not.toBeNull()
		expect(result!.mime).toBe('image/webp')
	})

	it('rejects invalid base64', () => {
		expect(normalizeChatImage({ mime: '', data: '%%%', size: 0 })).toBeNull()
	})

	it('rejects unsupported MIME (plain text)', () => {
		const text = Array.from(new TextEncoder().encode('hello world'))
		expect(normalizeChatImage({ mime: '', data: toBase64(text), size: 0 })).toBeNull()
	})

	it('rejects oversized base64 payload', () => {
		const data = 'A'.repeat(MAX_CHAT_IMAGE_BASE64_LEN + 1)
		expect(normalizeChatImage({ mime: '', data, size: 0 })).toBeNull()
	})

	it('rejects null/undefined', () => {
		expect(normalizeChatImage(null)).toBeNull()
		expect(normalizeChatImage(undefined)).toBeNull()
	})

	it('rejects empty data', () => {
		expect(normalizeChatImage({ mime: '', data: '', size: 0 })).toBeNull()
	})
})

describe('maxIncomingWSMessageBytes fits max chat image envelope', () => {
	it('JSON envelope with max image fits within limit', () => {
		const msg = JSON.stringify({
			type: 'chat',
			x: 123,
			y: 456,
			image: {
				mime: 'image/webp',
				data: 'A'.repeat(MAX_CHAT_IMAGE_BASE64_LEN),
				size: MAX_CHAT_IMAGE_BYTES,
				name: 'a'.repeat(100),
			},
		})
		expect(msg.length).toBeLessThanOrEqual(MAX_INCOMING_WS_MESSAGE_BYTES)
	})
})

describe('validateMove', () => {
	it('accepts valid coordinates', () => {
		expect(validateMove(0, 0)).toBe(true)
		expect(validateMove(100, 200)).toBe(true)
	})

	it('rejects negative coordinates', () => {
		expect(validateMove(-1, 0)).toBe(false)
		expect(validateMove(0, -1)).toBe(false)
	})

	it('rejects out-of-bounds coordinates', () => {
		expect(validateMove(MAP_PIXEL_WIDTH, 0)).toBe(false)
		expect(validateMove(0, MAP_PIXEL_HEIGHT)).toBe(false)
	})
})

describe('validateStatus', () => {
	it('accepts valid statuses', () => {
		expect(validateStatus('online')).toBe(true)
		expect(validateStatus('away')).toBe(true)
		expect(validateStatus('dnd')).toBe(true)
	})

	it('rejects invalid status', () => {
		expect(validateStatus('offline')).toBe(false)
		expect(validateStatus('')).toBe(false)
	})
})

describe('validateDirection', () => {
	it('accepts valid directions', () => {
		expect(validateDirection('up')).toBe(true)
		expect(validateDirection('down')).toBe(true)
		expect(validateDirection('left')).toBe(true)
		expect(validateDirection('right')).toBe(true)
	})

	it('rejects invalid direction', () => {
		expect(validateDirection('diagonal')).toBe(false)
	})
})

describe('validateAvatar', () => {
	it('accepts valid avatars 0-3', () => {
		for (let i = 0; i < 4; i++) expect(validateAvatar(i)).toBe(true)
	})

	it('rejects out of range', () => {
		expect(validateAvatar(-1)).toBe(false)
		expect(validateAvatar(4)).toBe(false)
		expect(validateAvatar(1.5)).toBe(false)
	})
})

describe('validateEmoji', () => {
	it('accepts valid emojis', () => {
		expect(validateEmoji('👋')).toBe(true)
		expect(validateEmoji('🔥')).toBe(true)
	})

	it('rejects invalid emoji', () => {
		expect(validateEmoji('😀')).toBe(false)
	})
})

describe('validateHexColor', () => {
	it('accepts valid hex colors', () => {
		expect(validateHexColor('#ff0000')).toBe(true)
		expect(validateHexColor('#AABBCC')).toBe(true)
	})

	it('rejects invalid hex colors', () => {
		expect(validateHexColor('ff0000')).toBe(false)
		expect(validateHexColor('#fff')).toBe(false)
		expect(validateHexColor('#gggggg')).toBe(false)
	})
})

describe('validateColors', () => {
	it('accepts valid palette', () => {
		expect(validateColors({ body: '#ff0000', eye: '#00ff00', foot: '#0000ff' })).toBe(true)
	})

	it('rejects null', () => {
		expect(validateColors(null)).toBe(false)
	})

	it('rejects partial invalid', () => {
		expect(validateColors({ body: '#ff0000', eye: 'bad', foot: '#0000ff' })).toBe(false)
	})
})

describe('encodeUpdates / decodeUpdates', () => {
	it('round-trips empty array', () => {
		expect(encodeUpdates([])).toBeNull()
		expect(decodeUpdates(null)).toEqual([])
		expect(decodeUpdates(new Uint8Array(0))).toEqual([])
	})

	it('round-trips single update', () => {
		const update = new Uint8Array([1, 2, 3, 4, 5])
		const encoded = encodeUpdates([update])!
		expect(encoded).not.toBeNull()
		// Check format: 4-byte big-endian length (5) + data
		expect(encoded.length).toBe(4 + 5)
		expect(encoded[0]).toBe(0) // big-endian uint32(5)
		expect(encoded[1]).toBe(0)
		expect(encoded[2]).toBe(0)
		expect(encoded[3]).toBe(5)
		const decoded = decodeUpdates(encoded)
		expect(decoded).toHaveLength(1)
		expect(decoded[0]).toEqual(update)
	})

	it('round-trips multiple updates', () => {
		const updates = [
			new Uint8Array([10, 20]),
			new Uint8Array([30, 40, 50]),
			new Uint8Array([60]),
		]
		const encoded = encodeUpdates(updates)!
		const decoded = decodeUpdates(encoded)
		expect(decoded).toHaveLength(3)
		expect(decoded[0]).toEqual(updates[0])
		expect(decoded[1]).toEqual(updates[1])
		expect(decoded[2]).toEqual(updates[2])
	})

	it('handles truncated data gracefully', () => {
		// 4-byte header says length=10 but only 3 bytes follow
		const truncated = new Uint8Array([0, 0, 0, 10, 1, 2, 3])
		const decoded = decodeUpdates(truncated)
		expect(decoded).toEqual([])
	})
})

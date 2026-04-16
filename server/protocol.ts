import type { ChatImage, ColorPalette } from '@shared/types'
import {
	MAP_WIDTH,
	MAP_HEIGHT,
	MAX_NICKNAME_LEN,
	MAX_CHAT_LEN,
	MAX_CUSTOM_STATUS_LEN,
	MAX_CHAT_IMAGE_BYTES,
} from '@shared/types'

// Map constants
export const TILE_SIZE = 16
export { MAP_WIDTH, MAP_HEIGHT, MAX_NICKNAME_LEN, MAX_CHAT_LEN, MAX_CUSTOM_STATUS_LEN, MAX_CHAT_IMAGE_BYTES }
export const MAP_PIXEL_WIDTH = MAP_WIDTH * TILE_SIZE
export const MAP_PIXEL_HEIGHT = MAP_HEIGHT * TILE_SIZE

// Player limits
export const MAX_PLAYERS = 20
export const MAX_AVATARS = 4

// Rate limits (per second)
export const MOVE_RATE_LIMIT = 10
export const EMOTE_RATE_LIMIT = 2

// Cooldowns (seconds)
export const PROFILE_COOLDOWN = 2
export const CUSTOM_STATUS_COOLDOWN = 2
export const SETTINGS_COOLDOWN = 2

// Speed limits (pixels per second)
export const MAX_SPEED = 400
export const DASH_SPEED = 1000
export const DASH_DURATION_MS = 150
export const DASH_COOLDOWN_MS = 1500

// Chat image limits
export const MAX_CHAT_IMAGE_BASE64_LEN = Math.floor((MAX_CHAT_IMAGE_BYTES + 2) / 3) * 4
export const MAX_INCOMING_WS_MESSAGE_BYTES = MAX_CHAT_IMAGE_BASE64_LEN + 8 * 1024
export const MAX_YJS_MESSAGE_BYTES = 1 << 20 // 1MB

// Proximity
export const PROXIMITY_RADIUS = 5.0

// Regional chat zone radius bounds (pixels)
export const DEFAULT_ZONE_RADIUS = 5.0 * TILE_SIZE
export const MAX_ZONE_RADIUS = 8.0 * TILE_SIZE
export const MIN_ZONE_RADIUS = 2.0 * TILE_SIZE

// Action domains
export const DOMAIN_REGIONAL_CHAT = 'regional_chat'
export const ACTION_UPDATE_SETTINGS = 'update_settings'

// Valid sets
const VALID_STATUSES = new Set(['online', 'away', 'dnd'])
const VALID_DIRECTIONS = new Set(['up', 'down', 'left', 'right'])
const VALID_EMOJIS = new Set(['👋', '☕', '🔥', '💻', '📢'])
const ALLOWED_CHAT_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

// Zero-width and invisible characters to strip
const INVISIBLE_CHARS = new Set([
	0x200b, 0x200c, 0x200d, 0xfeff, 0x00ad, 0x2060, 0x180e, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c,
	0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x00a0,
])

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function sanitizeString(s: string, maxLen: number): string {
	let result = ''
	for (const ch of s) {
		const code = ch.codePointAt(0)!
		// Drop control chars (except newline)
		if (code < 0x20 && code !== 0x0a) continue
		if (code === 0x7f) continue
		// Drop invisible/zero-width chars
		if (INVISIBLE_CHARS.has(code)) continue
		// Drop non-standard whitespace (Unicode Zs category except regular space)
		if (code !== 0x20 && isUnicodeZs(code)) continue
		result += ch
	}
	result = result.trim()
	// Truncate by codepoint count (not byte length)
	const runes = [...result]
	if (runes.length > maxLen) {
		return runes.slice(0, maxLen).join('')
	}
	return result
}

// Unicode Zs (Space_Separator) category codepoints (excluding U+0020 regular space)
function isUnicodeZs(code: number): boolean {
	return (
		code === 0x1680 ||
		(code >= 0x2000 && code <= 0x200a) ||
		code === 0x202f ||
		code === 0x205f ||
		code === 0x3000
	)
}

export function sanitizeNickname(s: string): string {
	return sanitizeString(s, MAX_NICKNAME_LEN)
}

export function sanitizeChat(s: string): string {
	return sanitizeString(s, MAX_CHAT_LEN)
}

export function sanitizeFileName(s: string): string {
	let result = sanitizeString(s, 100)
	result = result.replaceAll('/', '')
	result = result.replaceAll('\\', '')
	return result
}

// Detect MIME type from magic bytes (replaces Go's http.DetectContentType)
function detectMimeFromBytes(data: Uint8Array): string | null {
	if (data.length < 4) return null

	// PNG: 89 50 4E 47
	if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
		return 'image/png'
	}
	// JPEG: FF D8 FF
	if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
		return 'image/jpeg'
	}
	// GIF: 47 49 46 38
	if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) {
		return 'image/gif'
	}
	// WebP: RIFF....WEBP
	if (
		data.length >= 12 &&
		data[0] === 0x52 &&
		data[1] === 0x49 &&
		data[2] === 0x46 &&
		data[3] === 0x46 &&
		data[8] === 0x57 &&
		data[9] === 0x45 &&
		data[10] === 0x42 &&
		data[11] === 0x50
	) {
		return 'image/webp'
	}
	return null
}

/**
 * Validates and normalizes a chat image.
 * Returns null if the image is invalid.
 * NOTE: base64 decoding of ~2MB images blocks the event loop for ~1-5ms.
 * Acceptable for ≤20 players.
 */
export function normalizeChatImage(img: ChatImage | undefined | null): ChatImage | null {
	if (!img) return null
	if (!img.data || img.data.length > MAX_CHAT_IMAGE_BASE64_LEN) return null

	let decoded: Uint8Array
	try {
		decoded = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0))
	} catch {
		return null
	}

	if (decoded.length === 0 || decoded.length > MAX_CHAT_IMAGE_BYTES) return null

	const detectedMime = detectMimeFromBytes(decoded)
	if (!detectedMime || !ALLOWED_CHAT_IMAGE_MIMES.has(detectedMime)) return null

	return {
		mime: detectedMime,
		data: img.data,
		size: decoded.length,
		name: sanitizeFileName(img.name ?? ''),
	}
}

export function validateMove(x: number, y: number): boolean {
	return x >= 0 && x < MAP_PIXEL_WIDTH && y >= 0 && y < MAP_PIXEL_HEIGHT
}

export function validateStatus(s: string): boolean {
	return VALID_STATUSES.has(s)
}

export function validateDirection(d: string): boolean {
	return VALID_DIRECTIONS.has(d)
}

export function validateAvatar(a: number): boolean {
	return Number.isInteger(a) && a >= 0 && a < MAX_AVATARS
}

export function validateEmoji(e: string): boolean {
	return VALID_EMOJIS.has(e)
}

export function validateHexColor(c: string): boolean {
	return HEX_COLOR_RE.test(c)
}

export function validateColors(cp: ColorPalette | undefined | null): boolean {
	if (!cp) return false
	return validateHexColor(cp.body) && validateHexColor(cp.eye) && validateHexColor(cp.foot)
}

// Y.js update blob encoding — 4-byte big-endian length-prefix framing
export function encodeUpdates(updates: Uint8Array[]): Uint8Array | null {
	if (updates.length === 0) return null
	let size = 0
	for (const u of updates) size += 4 + u.length
	const buf = new Uint8Array(size)
	const view = new DataView(buf.buffer)
	let offset = 0
	for (const u of updates) {
		view.setUint32(offset, u.length)
		offset += 4
		buf.set(u, offset)
		offset += u.length
	}
	return buf
}

export function decodeUpdates(data: Uint8Array | null): Uint8Array[] {
	if (!data || data.length === 0) return []
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
	const updates: Uint8Array[] = []
	let offset = 0
	while (offset + 4 <= data.length) {
		const length = view.getUint32(offset)
		offset += 4
		if (offset + length > data.length) break
		updates.push(data.slice(offset, offset + length))
		offset += length
	}
	if (offset < data.length) {
		console.warn('[yjs] decodeUpdates: truncated blob, dropped', data.length - offset, 'bytes')
	}
	return updates
}

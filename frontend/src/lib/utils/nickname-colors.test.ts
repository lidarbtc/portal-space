import { describe, it, expect } from 'vitest'
import { resolveNicknameColor } from './nickname-colors'

describe('resolveNicknameColor', () => {
	it('returns a hex color string for a valid playerId', () => {
		const color = resolveNicknameColor('player-123')
		expect(color).toMatch(/^#[\da-f]{6}$/)
	})

	it('returns fallback color for empty playerId', () => {
		const color = resolveNicknameColor('')
		expect(color).toBe('#88aaff')
	})

	it('returns deterministic output for same input', () => {
		const a = resolveNicknameColor('player-abc')
		const b = resolveNicknameColor('player-abc')
		expect(a).toBe(b)
	})

	it('returns different colors for different playerIds', () => {
		const a = resolveNicknameColor('alice')
		const b = resolveNicknameColor('bob')
		expect(a).not.toBe(b)
	})

	it('uses body color from palette when provided', () => {
		const withPalette = resolveNicknameColor('player-1', {
			body: '#ff0000',
			eye: '#000000',
			foot: '#000000',
		})
		const withoutPalette = resolveNicknameColor('player-1')
		// With a red palette, the result should differ from the hash-based fallback
		expect(withPalette).not.toBe(withoutPalette)
	})

	it('falls back to hash when palette body is invalid hex', () => {
		const result = resolveNicknameColor('player-1', {
			body: 'not-a-color',
			eye: '#000',
			foot: '#000',
		})
		const fallback = resolveNicknameColor('player-1')
		expect(result).toBe(fallback)
	})

	it('handles 3-digit hex in palette', () => {
		const color = resolveNicknameColor('player-1', {
			body: '#f00',
			eye: '#000',
			foot: '#000',
		})
		expect(color).toMatch(/^#[\da-f]{6}$/)
	})

	it('produces colors with sufficient contrast against dark background', () => {
		// Test multiple IDs to ensure contrast is generally maintained
		const ids = ['alice', 'bob', 'charlie', 'dave', 'eve', 'frank']
		for (const id of ids) {
			const hex = resolveNicknameColor(id)
			const r = parseInt(hex.slice(1, 3), 16)
			const g = parseInt(hex.slice(3, 5), 16)
			const b = parseInt(hex.slice(5, 7), 16)

			// Relative luminance should be above a threshold for dark bg readability
			const [rr, gg, bb] = [r, g, b].map((c) => {
				const n = c / 255
				return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
			})
			const luminance = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb

			// Background (#101830) luminance is ~0.008
			// WCAG 4.5:1 ratio means (L1 + 0.05) / (0.008 + 0.05) >= 4.5
			// So luminance >= 4.5 * 0.058 - 0.05 = 0.211
			expect(luminance).toBeGreaterThan(0.2)
		}
	})
})

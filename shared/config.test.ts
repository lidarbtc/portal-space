import { describe, it, expect } from 'bun:test'
import { loadObjectConfig } from './config'

const VALID_YAML = `
quotaPerUser: 3
types:
  whiteboard:
    sprite: graphics/whiteboard
    interactionRadius: 24
    hitShape: rect
    hitRect: { x: -16, y: -32, w: 32, h: 48 }
    defaultState: null
  regional_chat:
    sprite: image/ward-stone
    interactionRadius: 24
    hitShape: circle
    hitCircle: { radius: 24 }
    defaultState: { name: '결계석', radius: 80, retainHistory: false }
`

describe('loadObjectConfig', () => {
	it('parses a valid YAML with both types (AC-1)', () => {
		const cfg = loadObjectConfig(VALID_YAML)
		expect(cfg.quotaPerUser).toBe(3)
		expect(cfg.types.whiteboard).toBeDefined()
		expect(cfg.types.whiteboard.sprite).toBe('graphics/whiteboard')
		expect(cfg.types.whiteboard.hitShape).toBe('rect')
		expect(cfg.types.whiteboard.hitRect).toEqual({ x: -16, y: -32, w: 32, h: 48 })
		expect(cfg.types.whiteboard.defaultState).toBeNull()

		expect(cfg.types.regional_chat).toBeDefined()
		expect(cfg.types.regional_chat.interactionRadius).toBe(24)
		expect(cfg.types.regional_chat.hitShape).toBe('circle')
		expect(cfg.types.regional_chat.hitCircle).toEqual({ radius: 24 })
		expect(cfg.types.regional_chat.defaultState).toEqual({
			name: '결계석',
			radius: 80,
			retainHistory: false,
		})
	})

	it('rejects unknown top-level keys', () => {
		const yaml = `
quotaPerUser: 3
bogusKey: whatever
types:
  whiteboard:
    sprite: a
    interactionRadius: 1
    hitShape: rect
`
		expect(() => loadObjectConfig(yaml)).toThrow(/unknown top-level key/)
	})

	it('rejects non-positive quotaPerUser', () => {
		const yaml = `
quotaPerUser: 0
types: {}
`
		expect(() => loadObjectConfig(yaml)).toThrow(/quotaPerUser/)
	})

	it('rejects missing required fields', () => {
		const yaml = `
quotaPerUser: 3
types:
  whiteboard:
    sprite: x
    interactionRadius: 24
`
		// no hitShape
		expect(() => loadObjectConfig(yaml)).toThrow(/hitShape/)
	})

	it('rejects invalid hitShape', () => {
		const yaml = `
quotaPerUser: 3
types:
  whiteboard:
    sprite: x
    interactionRadius: 24
    hitShape: hexagon
`
		expect(() => loadObjectConfig(yaml)).toThrow(/hitShape/)
	})

	it('allows unknown fields inside types.* (additive schema evolution)', () => {
		const yaml = `
quotaPerUser: 3
types:
  whiteboard:
    sprite: x
    interactionRadius: 24
    hitShape: rect
    futureField: 42
`
		const cfg = loadObjectConfig(yaml)
		expect(cfg.types.whiteboard.sprite).toBe('x')
	})

	it('enforces closed-set: arbitrary types are allowed but typed as ObjectTypeDef', () => {
		const yaml = `
quotaPerUser: 3
types:
  custom:
    sprite: s
    interactionRadius: 10
    hitShape: rect
`
		const cfg = loadObjectConfig(yaml)
		expect(cfg.types.custom).toBeDefined()
	})
})

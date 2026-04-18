import { describe, it, expect } from 'bun:test'
import { parseObjectLayer } from './tiled'

const FIXTURE = {
	layers: [
		{
			type: 'tilelayer',
			name: 'ground',
			data: [0, 0, 0],
		},
		{
			type: 'objectgroup',
			name: 'objects',
			objects: [
				{ id: 1, name: 'wb-1', type: 'whiteboard', x: 448, y: 384 },
				{ id: 2, name: 'wb-2', type: 'whiteboard', x: 544, y: 384 },
				{
					id: 3,
					name: 'rc-1',
					type: 'regional_chat',
					x: 336,
					y: 256,
					properties: [
						{ name: 'stateName', type: 'string', value: '결계석' },
						{ name: 'stateRadius', type: 'int', value: 80 },
						{ name: 'stateRetain', type: 'bool', value: false },
					],
				},
			],
		},
	],
}

describe('parseObjectLayer', () => {
	it('extracts 3 objects from the fixture (AC-3)', () => {
		const out = parseObjectLayer(FIXTURE)
		expect(out.length).toBe(3)
	})

	it('emits name-keyed ids (tiled:<name>), NOT numeric ids', () => {
		const out = parseObjectLayer(FIXTURE)
		expect(out.map((o) => o.id).sort()).toEqual(['tiled:rc-1', 'tiled:wb-1', 'tiled:wb-2'])
	})

	it('preserves x/y and type', () => {
		const out = parseObjectLayer(FIXTURE)
		const wb1 = out.find((o) => o.id === 'tiled:wb-1')!
		expect(wb1.x).toBe(448)
		expect(wb1.y).toBe(384)
		expect(wb1.type).toBe('whiteboard')
	})

	it('collects per-instance properties for regional_chat', () => {
		const out = parseObjectLayer(FIXTURE)
		const rc1 = out.find((o) => o.id === 'tiled:rc-1')!
		expect(rc1.properties.stateName).toBe('결계석')
		expect(rc1.properties.stateRadius).toBe(80)
		expect(rc1.properties.stateRetain).toBe(false)
	})

	it('ignores tile layers', () => {
		const out = parseObjectLayer(FIXTURE)
		// Only objectgroup content should appear
		expect(out.every((o) => o.name)).toBe(true)
	})

	it('skips objects with empty name', () => {
		const out = parseObjectLayer({
			layers: [
				{
					type: 'objectgroup',
					objects: [
						{ id: 10, name: '', type: 'whiteboard', x: 0, y: 0 },
						{ id: 11, name: 'ok', type: 'whiteboard', x: 16, y: 16 },
					],
				},
			],
		})
		expect(out.length).toBe(1)
		expect(out[0].name).toBe('ok')
	})

	it('returns empty when no objectgroup layer exists', () => {
		expect(parseObjectLayer({ layers: [{ type: 'tilelayer' }] })).toEqual([])
	})

	it('deduplicates on name collision', () => {
		const out = parseObjectLayer({
			layers: [
				{
					type: 'objectgroup',
					objects: [
						{ id: 1, name: 'dup', type: 'whiteboard', x: 0, y: 0 },
						{ id: 2, name: 'dup', type: 'whiteboard', x: 16, y: 16 },
					],
				},
			],
		})
		expect(out.length).toBe(1)
	})
})

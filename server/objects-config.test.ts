import { describe, it, expect } from 'bun:test'
import { loadObjectConfig } from '@shared/config'
import { Storage } from './storage'
import { loadObjects, mergeState } from './objects-config'

const YAML = `
quotaPerUser: 3
types:
  whiteboard:
    sprite: graphics/whiteboard
    interactionRadius: 24
    hitShape: rect
    defaultState: null
  regional_chat:
    sprite: image/ward-stone
    interactionRadius: 24
    hitShape: circle
    hitCircle: { radius: 24 }
    defaultState: { name: '결계석', radius: 80, retainHistory: false }
`

const TILED_FIXTURE = {
	layers: [
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

describe('loadObjects (3-layer merge)', () => {
	it('materialises the 3 Tiled-seeded objects with correct ids', () => {
		const cfg = loadObjectConfig(YAML)
		const storage = new Storage(':memory:')
		try {
			const out = loadObjects(TILED_FIXTURE, storage, cfg, 'default')
			const ids = out.map((o) => o.id).sort()
			expect(ids).toEqual(['tiled:rc-1', 'tiled:wb-1', 'tiled:wb-2'])
		} finally {
			storage.close()
		}
	})

	it('rc-1 merged state matches YAML default when Tiled props equal defaults (identity merge)', () => {
		const cfg = loadObjectConfig(YAML)
		const storage = new Storage(':memory:')
		try {
			const out = loadObjects(TILED_FIXTURE, storage, cfg, 'default')
			const rc1 = out.find((o) => o.id === 'tiled:rc-1')!
			expect(rc1.state).toEqual({ name: '결계석', radius: 80, retainHistory: false })
		} finally {
			storage.close()
		}
	})

	it('Tiled property overrides YAML default', () => {
		const cfg = loadObjectConfig(YAML)
		const storage = new Storage(':memory:')
		const override = {
			layers: [
				{
					type: 'objectgroup',
					objects: [
						{
							id: 1,
							name: 'rc-x',
							type: 'regional_chat',
							x: 0,
							y: 0,
							properties: [
								{ name: 'stateName', type: 'string', value: 'override' },
								{ name: 'stateRadius', type: 'int', value: 120 },
								{ name: 'stateRetain', type: 'bool', value: true },
							],
						},
					],
				},
			],
		}
		try {
			const out = loadObjects(override, storage, cfg, 'default')
			const rc = out.find((o) => o.id === 'tiled:rc-x')!
			expect(rc.state).toEqual({ name: 'override', radius: 120, retainHistory: true })
		} finally {
			storage.close()
		}
	})

	it('unions runtime Storage rows (user-placed) alongside Tiled-seeded', () => {
		const cfg = loadObjectConfig(YAML)
		const storage = new Storage(':memory:')
		try {
			storage.insertObject({
				id: 'nano-1',
				roomId: 'default',
				type: 'whiteboard',
				x: 100,
				y: 100,
				ownerId: 'alice',
				placedAt: 1000,
				state: null,
			})
			const out = loadObjects(TILED_FIXTURE, storage, cfg, 'default')
			const ids = out.map((o) => o.id).sort()
			expect(ids).toContain('nano-1')
			expect(ids).toContain('tiled:wb-1')
			expect(out.length).toBe(4) // 3 Tiled + 1 runtime
		} finally {
			storage.close()
		}
	})

	it('filters out Storage rows whose type was removed from YAML', () => {
		const cfgMinimal = loadObjectConfig(`
quotaPerUser: 3
types:
  whiteboard:
    sprite: x
    interactionRadius: 1
    hitShape: rect
`)
		const storage = new Storage(':memory:')
		try {
			storage.insertObject({
				id: 'orphan-1',
				roomId: 'default',
				type: 'regional_chat',
				x: 0,
				y: 0,
				ownerId: 'o',
				placedAt: 1,
				state: null,
			})
			const out = loadObjects(TILED_FIXTURE, storage, cfgMinimal, 'default')
			expect(out.find((o) => o.id === 'orphan-1')).toBeUndefined()
		} finally {
			storage.close()
		}
	})

	it('guarantees unique ids (Tiled vs nanoid — no collision)', () => {
		// Tiled ids are prefixed 'tiled:'; nanoid alphabet excludes ':'.
		const cfg = loadObjectConfig(YAML)
		const storage = new Storage(':memory:')
		try {
			storage.insertObject({
				id: 'plainId',
				roomId: 'default',
				type: 'whiteboard',
				x: 0,
				y: 0,
				ownerId: 'o',
				placedAt: 1,
				state: null,
			})
			const out = loadObjects(TILED_FIXTURE, storage, cfg, 'default')
			const ids = out.map((o) => o.id)
			expect(new Set(ids).size).toBe(ids.length)
			expect(ids.every((id) => id === 'plainId' || id.startsWith('tiled:'))).toBe(true)
		} finally {
			storage.close()
		}
	})
})

describe('mergeState (standalone)', () => {
	const cfg = loadObjectConfig(YAML)

	it('defaultState-only when nothing to merge', () => {
		const out = mergeState('regional_chat', cfg, null, undefined)
		expect(out).toEqual({ name: '결계석', radius: 80, retainHistory: false })
	})

	it('Storage overlay is highest priority', () => {
		const out = mergeState('regional_chat', cfg, null, {
			id: 'x',
			roomId: 'default',
			type: 'regional_chat',
			x: 0,
			y: 0,
			ownerId: 'o',
			placedAt: 1,
			state: { name: 'stored', radius: 200, retainHistory: true },
		})
		expect(out).toEqual({ name: 'stored', radius: 200, retainHistory: true })
	})
})

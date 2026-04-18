import { describe, it, expect } from 'bun:test'
import { loadObjectConfig } from '@shared/config'
import { Hub } from './hub'
import { Storage } from './storage'

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

const TILED = {
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

describe('Hub', () => {
	it('seeds default room with exactly the 3 Tiled objects (AC-2)', () => {
		const storage = new Storage(':memory:')
		try {
			const hub = new Hub(storage, loadObjectConfig(YAML), TILED)
			const room = hub.defaultRoom()!
			expect(room).toBeDefined()
			expect(room.objects.size).toBe(3)
			expect(room.objects.has('tiled:wb-1')).toBe(true)
			expect(room.objects.has('tiled:wb-2')).toBe(true)
			expect(room.objects.has('tiled:rc-1')).toBe(true)
		} finally {
			storage.close()
		}
	})

	it('unions Storage-seeded runtime objects into the default room (AC-5)', () => {
		const storage = new Storage(':memory:')
		try {
			storage.insertObject({
				id: 'runtime-a',
				roomId: 'default',
				type: 'whiteboard',
				x: 16,
				y: 16,
				ownerId: 'u',
				placedAt: 1,
				state: null,
			})
			storage.insertObject({
				id: 'runtime-b',
				roomId: 'default',
				type: 'whiteboard',
				x: 32,
				y: 32,
				ownerId: 'u',
				placedAt: 2,
				state: null,
			})

			const hub = new Hub(storage, loadObjectConfig(YAML), TILED)
			const room = hub.defaultRoom()!
			expect(room.objects.size).toBe(5) // 3 Tiled + 2 runtime
			expect(room.objects.has('runtime-a')).toBe(true)
			expect(room.objects.has('runtime-b')).toBe(true)
		} finally {
			storage.close()
		}
	})

	it('closeAll does not throw on an empty default room', () => {
		const storage = new Storage(':memory:')
		try {
			const hub = new Hub(storage, loadObjectConfig(YAML), TILED)
			expect(() => hub.closeAll()).not.toThrow()
		} finally {
			storage.close()
		}
	})
})

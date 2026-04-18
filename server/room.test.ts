import { beforeEach, describe, expect, it } from 'bun:test'
import { loadObjectConfig, type ObjectsConfig } from '@shared/config'
import type { OutgoingMessage } from '@shared/types'
import type { ServerWebSocket } from 'bun'
import { zoneChatLogs } from './db/schema'
import { metrics } from './metrics'
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './protocol'
import { Room } from './room'
import { Storage } from './storage'

const FIXTURE_YAML = `
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
    defaultState: { name: 'fixture-zone', radius: 80, retainHistory: false }
`

function newTestRoom(storage?: Storage, config?: ObjectsConfig): Room {
	return new Room({
		id: 'test',
		width: MAP_WIDTH,
		height: MAP_HEIGHT,
		storage: storage ?? new Storage(':memory:'),
		config: config ?? loadObjectConfig(FIXTURE_YAML),
	})
}

// Mock WebSocket that collects sent messages
function createMockWs(): ServerWebSocket<unknown> & { messages: OutgoingMessage[] } {
	const messages: OutgoingMessage[] = []
	return {
		messages,
		send(data: string) {
			messages.push(JSON.parse(data))
		},
		close() {},
		// Satisfy type — unused fields
		data: {},
		readyState: 1,
		remoteAddress: '',
		binaryType: 'arraybuffer',
		subscribe() {},
		unsubscribe() {},
		isSubscribed() {
			return false
		},
		cork() {},
		publish() {},
		publishText() {},
		publishBinary() {},
		ping() {},
		pong() {},
		terminate() {},
	} as unknown as ServerWebSocket<unknown> & { messages: OutgoingMessage[] }
}

function joinClient(room: Room, ws: ReturnType<typeof createMockWs>, nickname = 'tester') {
	room.handleMessage(
		ws,
		JSON.stringify({
			type: 'join',
			nickname,
			colors: { body: '#ff0000', eye: '#00ff00', foot: '#0000ff' },
		}),
	)
}

function idOf(ws: ReturnType<typeof createMockWs>): string {
	const snap = ws.messages.find((m) => m.type === 'snapshot')
	if (!snap?.self?.id)
		throw new Error('snapshot missing self.id — idOf must run before ws.messages is cleared')
	return snap.self.id
}

describe('Room', () => {
	let room: Room

	beforeEach(() => {
		room = newTestRoom()
	})

	describe('collision map', () => {
		it('marks borders as collision', () => {
			expect(room.isWalkable(0, 0)).toBe(false) // top-left corner
			expect(room.isWalkable(MAP_WIDTH - 1, 0)).toBe(false) // top-right
			expect(room.isWalkable(0, MAP_HEIGHT - 1)).toBe(false) // bottom-left
		})

		it('marks table positions as collision', () => {
			// baseTables: first entry is (4,4)
			expect(room.isWalkable(4, 4)).toBe(false)
			expect(room.isWalkable(5, 4)).toBe(false)
			expect(room.isWalkable(10, 7)).toBe(false)
		})

		it('non-table interior tile is walkable', () => {
			// (30, 22) is the center but hits a table tile. (3, 3) is interior, not a table.
			expect(room.isWalkable(3, 3)).toBe(true)
		})
	})

	describe('findSpawnPoint', () => {
		it('returns pixel coordinates at tile center', () => {
			const [x, y] = room.findSpawnPoint()
			// Should be a tile center: (tile * TILE_SIZE + TILE_SIZE/2)
			expect((x - TILE_SIZE / 2) % TILE_SIZE).toBe(0)
			expect((y - TILE_SIZE / 2) % TILE_SIZE).toBe(0)
		})

		it('returns walkable position', () => {
			const [x, y] = room.findSpawnPoint()
			const tileX = Math.floor(x / TILE_SIZE)
			const tileY = Math.floor(y / TILE_SIZE)
			expect(room.isWalkable(tileX, tileY)).toBe(true)
		})
	})

	describe('join / leave', () => {
		it('sends snapshot on join', () => {
			const ws = createMockWs()
			joinClient(room, ws)

			const snapshot = ws.messages.find((m) => m.type === 'snapshot')
			expect(snapshot).toBeDefined()
			expect(snapshot!.self).toBeDefined()
			expect(snapshot!.self!.nickname).toBe('tester')
		})

		it('rejects join when room is full', () => {
			// Fill room to MAX_PLAYERS
			for (let i = 0; i < 20; i++) {
				const ws = createMockWs()
				joinClient(room, ws, `player${i}`)
			}
			expect(room.players.size).toBe(20)

			// 21st player should get error
			const ws = createMockWs()
			joinClient(room, ws, 'overflow')
			const err = ws.messages.find((m) => m.type === 'error')
			expect(err).toBeDefined()
			expect(err!.message).toBe('room is full')
		})

		it('broadcasts join to existing players', () => {
			const ws1 = createMockWs()
			joinClient(room, ws1, 'player1')

			const ws2 = createMockWs()
			joinClient(room, ws2, 'player2')

			// player1 should have received join from player2
			const joinMsg = ws1.messages.find(
				(m) => m.type === 'join' && m.player?.nickname === 'player2',
			)
			expect(joinMsg).toBeDefined()
		})

		it('broadcasts leave on disconnect', () => {
			const ws1 = createMockWs()
			joinClient(room, ws1, 'player1')
			const ws2 = createMockWs()
			joinClient(room, ws2, 'player2')

			// Get player2's ID from snapshot
			const snapshot = ws2.messages.find((m) => m.type === 'snapshot')
			const player2Id = snapshot!.self!.id

			// Disconnect player2
			room.handleClose(ws2)
			expect(room.players.size).toBe(1)

			// player1 should have received leave
			const leaveMsg = ws1.messages.find((m) => m.type === 'leave' && m.id === player2Id)
			expect(leaveMsg).toBeDefined()
		})
	})

	describe('handleMove', () => {
		it('broadcasts valid move', () => {
			const ws1 = createMockWs()
			joinClient(room, ws1, 'mover')
			const ws2 = createMockWs()
			joinClient(room, ws2, 'observer')

			// Clear existing messages
			ws2.messages.length = 0

			// Need to wait for rate limit (100ms)
			// Manually set lastMove to past
			const client = [...room.players.values()].find((c) => c.nickname === 'mover')!
			client.lastMove = 0

			room.handleMessage(
				ws1,
				JSON.stringify({
					type: 'move',
					x: 200,
					y: 200,
					dir: 'right',
				}),
			)

			const moveMsg = ws2.messages.find((m) => m.type === 'move')
			expect(moveMsg).toBeDefined()
			expect(moveMsg!.x).toBe(200)
			expect(moveMsg!.y).toBe(200)
		})

		it('rejects move outside bounds', () => {
			const ws = createMockWs()
			joinClient(room, ws)
			const client = [...room.players.values()][0]
			client.lastMove = 0

			const before = client.x
			room.handleMessage(
				ws,
				JSON.stringify({
					type: 'move',
					x: -10,
					y: 200,
					dir: 'left',
				}),
			)
			expect(client.x).toBe(before)
		})

		it('rejects speed exceeding 400px/s', () => {
			const ws = createMockWs()
			joinClient(room, ws)
			const client = [...room.players.values()][0]

			// Set client at origin with a recent lastMove
			client.x = 100
			client.y = 100
			client.lastMove = Date.now() - 100 // 100ms ago

			// Try to move 500px in 100ms = 5000px/s (way over 400)
			room.handleMessage(
				ws,
				JSON.stringify({
					type: 'move',
					x: 600,
					y: 100,
					dir: 'right',
				}),
			)
			// Should have been rejected
			expect(client.x).toBe(100)
		})

		it('allows 1000px/s during dash', () => {
			const ws = createMockWs()
			joinClient(room, ws)
			const client = [...room.players.values()][0]

			client.x = 100
			client.y = 100
			client.lastMove = Date.now() - 200
			client.dashUntil = Date.now() + 1000 // dashing

			// Move 180px in 200ms = 900px/s (over 400 but under 1000)
			room.handleMessage(
				ws,
				JSON.stringify({
					type: 'move',
					x: 280,
					y: 100,
					dir: 'right',
				}),
			)
			expect(client.x).toBe(280)
		})
	})

	describe('zone membership', () => {
		it('enters zone when within radius', () => {
			// Add a zone
			room.addObject({
				id: 'zone-1',
				type: 'regional_chat',
				x: 200,
				y: 200,
				state: { name: '테스트존', radius: 100, retainHistory: false },
			})

			const ws = createMockWs()
			joinClient(room, ws)
			const client = [...room.players.values()][0]

			// Move client into zone
			client.x = 200
			client.y = 200
			client.lastMove = 0
			room.handleMessage(
				ws,
				JSON.stringify({
					type: 'move',
					x: 210,
					y: 210,
					dir: 'down',
				}),
			)

			const enterMsg = ws.messages.find(
				(m) => m.type === 'chat' && m.isSystem && m.zoneEvent === 'enter',
			)
			expect(enterMsg).toBeDefined()
			expect(enterMsg!.text).toBe('테스트존에 입장했습니다')
		})

		it('exits zone when leaving radius', () => {
			room.addObject({
				id: 'zone-1',
				type: 'regional_chat',
				x: 200,
				y: 200,
				state: { name: '테스트존', radius: 50, retainHistory: false },
			})

			const ws = createMockWs()
			joinClient(room, ws)
			const client = [...room.players.values()][0]

			// Put client in zone
			client.currentZoneID = 'zone-1'
			client.x = 200
			client.y = 200
			client.lastMove = 0

			// Move far away
			room.handleMessage(
				ws,
				JSON.stringify({
					type: 'move',
					x: 400,
					y: 400,
					dir: 'right',
				}),
			)

			const exitMsg = ws.messages.find(
				(m) => m.type === 'chat' && m.isSystem && m.zoneEvent === 'exit',
			)
			expect(exitMsg).toBeDefined()
			expect(exitMsg!.text).toBe('테스트존에서 퇴장했습니다')
		})
	})

	describe('chat routing', () => {
		it('zone chat sends only to zone members', () => {
			room.addObject({
				id: 'zone-1',
				type: 'regional_chat',
				x: 200,
				y: 200,
				state: { name: '테스트존', radius: 100, retainHistory: false },
			})

			const ws1 = createMockWs()
			const ws2 = createMockWs()
			const ws3 = createMockWs()
			joinClient(room, ws1, 'inZone1')
			joinClient(room, ws2, 'inZone2')
			joinClient(room, ws3, 'outsider')

			const [c1, c2, c3] = [...room.players.values()]
			c1.currentZoneID = 'zone-1'
			c2.currentZoneID = 'zone-1'
			c3.currentZoneID = ''

			// Clear messages
			ws1.messages.length = 0
			ws2.messages.length = 0
			ws3.messages.length = 0

			room.handleMessage(
				ws1,
				JSON.stringify({
					type: 'chat',
					text: 'zone message',
				}),
			)

			// Both zone members should receive
			expect(ws1.messages.some((m) => m.type === 'chat' && m.text === 'zone message')).toBe(
				true,
			)
			expect(ws2.messages.some((m) => m.type === 'chat' && m.text === 'zone message')).toBe(
				true,
			)
			// Outsider should NOT
			expect(ws3.messages.some((m) => m.type === 'chat' && m.text === 'zone message')).toBe(
				false,
			)
		})

		it('global chat broadcasts to all', () => {
			const ws1 = createMockWs()
			const ws2 = createMockWs()
			joinClient(room, ws1, 'chatter')
			joinClient(room, ws2, 'listener')

			ws1.messages.length = 0
			ws2.messages.length = 0

			room.handleMessage(
				ws1,
				JSON.stringify({
					type: 'chat',
					text: 'hello all',
				}),
			)

			expect(ws1.messages.some((m) => m.type === 'chat' && m.text === 'hello all')).toBe(true)
			expect(ws2.messages.some((m) => m.type === 'chat' && m.text === 'hello all')).toBe(true)
		})
	})

	describe('handleChat /place', () => {
		function sendPlace(ws: ReturnType<typeof createMockWs>, type: string, room: Room): void {
			room.handleMessage(ws, JSON.stringify({ type: 'chat', text: `/place ${type}` }))
		}

		it('valid /place whiteboard broadcasts object_add with snapped tile-center coords (AC-4)', () => {
			const ws1 = createMockWs()
			const ws2 = createMockWs()
			joinClient(room, ws1, 'placer')
			joinClient(room, ws2, 'observer')
			const placerId = idOf(ws1)

			// Move the placer so we control the snap target.
			room.handleMessage(
				ws1,
				JSON.stringify({
					type: 'move',
					x: 10 * TILE_SIZE + 5,
					y: 7 * TILE_SIZE + 9,
					dir: 'down',
				}),
			)

			ws1.messages.length = 0
			ws2.messages.length = 0

			sendPlace(ws1, 'whiteboard', room)

			const add1 = ws1.messages.find((m) => m.type === 'object_add')
			const add2 = ws2.messages.find((m) => m.type === 'object_add')
			expect(add1).toBeDefined()
			expect(add2).toBeDefined()
			expect(add1?.object?.type).toBe('whiteboard')
			// Snap to tile top-left (matches Tiled convention for wb-1/wb-2/rc-1).
			expect(add1?.object?.x).toBe(10 * TILE_SIZE)
			expect(add1?.object?.y).toBe(7 * TILE_SIZE)
			expect(add1?.object?.id).toBeDefined()
			expect(add1?.object?.ownerId).toBe(placerId)

			// /place text must NOT leak as a chat message anywhere
			expect(
				ws1.messages.some((m) => m.type === 'chat' && m.text === '/place whiteboard'),
			).toBe(false)
			expect(
				ws2.messages.some((m) => m.type === 'chat' && m.text === '/place whiteboard'),
			).toBe(false)
		})

		it('unknown type is rejected with sender-only error and no state mutation (AC-7)', () => {
			const ws1 = createMockWs()
			const ws2 = createMockWs()
			joinClient(room, ws1, 'placer')
			joinClient(room, ws2, 'observer')

			const sizeBefore = room.objects.size
			ws1.messages.length = 0
			ws2.messages.length = 0

			sendPlace(ws1, 'unknown_type', room)

			expect(ws1.messages.some((m) => m.type === 'error')).toBe(true)
			expect(ws2.messages.some((m) => m.type === 'error')).toBe(false)
			expect(ws1.messages.some((m) => m.type === 'object_add')).toBe(false)
			expect(ws2.messages.some((m) => m.type === 'object_add')).toBe(false)
			expect(room.objects.size).toBe(sizeBefore)
		})
	})

	describe('FIFO eviction', () => {
		it('N+1-th /place evicts the oldest with object_remove before object_add (AC-6)', () => {
			const ws1 = createMockWs()
			joinClient(room, ws1, 'spammer')

			room.handleMessage(
				ws1,
				JSON.stringify({
					type: 'move',
					x: 10 * TILE_SIZE + 5,
					y: 7 * TILE_SIZE + 5,
					dir: 'down',
				}),
			)
			ws1.messages.length = 0

			// quotaPerUser = 3
			for (let i = 0; i < 3; i++) {
				room.handleMessage(ws1, JSON.stringify({ type: 'chat', text: '/place whiteboard' }))
			}
			const adds = ws1.messages.filter((m) => m.type === 'object_add')
			expect(adds).toHaveLength(3)
			const firstId = adds[0].object!.id
			const removesBefore = ws1.messages.filter((m) => m.type === 'object_remove')
			expect(removesBefore).toHaveLength(0)

			ws1.messages.length = 0

			// 4th /place — must evict first, in the order: object_remove THEN object_add
			room.handleMessage(ws1, JSON.stringify({ type: 'chat', text: '/place whiteboard' }))

			const ordered = ws1.messages.filter(
				(m) => m.type === 'object_remove' || m.type === 'object_add',
			)
			expect(ordered).toHaveLength(2)
			expect(ordered[0].type).toBe('object_remove')
			expect(ordered[0].objectId).toBe(firstId)
			expect(ordered[1].type).toBe('object_add')

			// Room state: exactly 3 user-placed remain (no Tiled seed in this test room).
			expect(room.objects.size).toBe(3)
		})

		it('lazy seed from Storage so pre-existing rows count toward quota', () => {
			const storage = new Storage(':memory:')
			const fixtureRoom = newTestRoom(storage)
			const ws1 = createMockWs()
			joinClient(fixtureRoom, ws1, 'returning')
			const clientId = idOf(ws1)

			// Pre-seed Storage as if a prior session had already placed 3 objects.
			for (let i = 0; i < 3; i++) {
				storage.insertObject({
					id: `pre-${i}`,
					roomId: 'test',
					type: 'whiteboard',
					x: 0,
					y: 0,
					state: null,
					ownerId: clientId,
					placedAt: 1000 + i,
				})
			}

			fixtureRoom.handleMessage(
				ws1,
				JSON.stringify({ type: 'move', x: 10 * TILE_SIZE, y: 7 * TILE_SIZE, dir: 'down' }),
			)
			ws1.messages.length = 0

			// FIFO must trip on the very first /place of this session because Storage already holds 3.
			fixtureRoom.handleMessage(
				ws1,
				JSON.stringify({ type: 'chat', text: '/place whiteboard' }),
			)

			const remove = ws1.messages.find((m) => m.type === 'object_remove')
			expect(remove?.objectId).toBe('pre-0')
			expect(fixtureRoom._debugIsSeeded(clientId)).toBe(true)
			expect(fixtureRoom._debugOwnedIds(clientId)).toHaveLength(3)
		})

		it('disconnect clears in-memory FIFO maps but Storage rows persist', () => {
			const storage = new Storage(':memory:')
			const fixtureRoom = newTestRoom(storage)
			const ws1 = createMockWs()
			joinClient(fixtureRoom, ws1, 'leaver')
			const clientId = idOf(ws1)

			fixtureRoom.handleMessage(
				ws1,
				JSON.stringify({ type: 'move', x: 10 * TILE_SIZE, y: 7 * TILE_SIZE, dir: 'down' }),
			)
			fixtureRoom.handleMessage(
				ws1,
				JSON.stringify({ type: 'chat', text: '/place whiteboard' }),
			)
			expect(fixtureRoom._debugOwnedIds(clientId)).toHaveLength(1)
			expect(fixtureRoom._debugIsSeeded(clientId)).toBe(true)

			fixtureRoom.handleClose(ws1)

			expect(fixtureRoom._debugOwnedIds(clientId)).toBeUndefined()
			expect(fixtureRoom._debugIsSeeded(clientId)).toBe(false)
			// Storage contract: owner rows remain for next-session seed.
			expect(storage.listObjectsByOwner('test', clientId)).toHaveLength(1)
		})
	})

	describe('zone chat persistence (retainHistory)', () => {
		const TINY_PNG =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII='

		function setupZone(retainHistory: boolean) {
			const storage = new Storage(':memory:')
			const r = newTestRoom(storage)
			r.addObject({
				id: 'zone-1',
				type: 'regional_chat',
				x: 200,
				y: 200,
				state: { name: '테스트존', radius: 100, retainHistory },
			})
			return { r, storage }
		}

		function joinInZone(r: Room, ws: ReturnType<typeof createMockWs>, nickname: string) {
			joinClient(r, ws, nickname)
			const client = [...r.players.values()].find((c) => c.nickname === nickname)!
			client.currentZoneID = 'zone-1'
			return client
		}

		function readLogs(storage: Storage) {
			return storage.db.select().from(zoneChatLogs).all()
		}

		it('retain=true + text → row appended', () => {
			const { r, storage } = setupZone(true)
			const ws = createMockWs()
			joinInZone(r, ws, 'writer')

			r.handleMessage(ws, JSON.stringify({ type: 'chat', text: 'persist me' }))

			const rows = readLogs(storage)
			expect(rows).toHaveLength(1)
			expect(rows[0]).toMatchObject({
				zoneId: 'zone-1',
				senderNickname: 'writer',
				text: 'persist me',
			})
			expect(rows[0].senderClientId).toBeTruthy()
			expect(typeof rows[0].createdAt).toBe('number')
			storage.close()
		})

		it('retain=false + text → NOT appended', () => {
			const { r, storage } = setupZone(false)
			const ws = createMockWs()
			joinInZone(r, ws, 'writer')

			r.handleMessage(ws, JSON.stringify({ type: 'chat', text: 'do not persist' }))

			expect(readLogs(storage)).toHaveLength(0)
			storage.close()
		})

		it('retain=true + image-only → NOT appended', () => {
			const { r, storage } = setupZone(true)
			const ws = createMockWs()
			joinInZone(r, ws, 'writer')

			r.handleMessage(
				ws,
				JSON.stringify({
					type: 'chat',
					image: { mime: 'image/png', data: TINY_PNG, size: 70, name: 'dot.png' },
				}),
			)

			expect(readLogs(storage)).toHaveLength(0)
			storage.close()
		})

		it('retain=true + mixed (text+image) → NOT appended (policy: drop)', () => {
			const { r, storage } = setupZone(true)
			const ws = createMockWs()
			joinInZone(r, ws, 'writer')

			r.handleMessage(
				ws,
				JSON.stringify({
					type: 'chat',
					text: 'caption',
					image: { mime: 'image/png', data: TINY_PNG, size: 70, name: 'dot.png' },
				}),
			)

			expect(readLogs(storage)).toHaveLength(0)
			storage.close()
		})

		it('global chat (no zone) → NOT appended', () => {
			const { r, storage } = setupZone(true)
			const ws = createMockWs()
			joinClient(r, ws, 'writer') // not in zone-1
			const client = [...r.players.values()][0]
			client.currentZoneID = ''

			r.handleMessage(ws, JSON.stringify({ type: 'chat', text: 'broadcast-only' }))

			expect(readLogs(storage)).toHaveLength(0)
			storage.close()
		})
	})

	describe('facing8 validation', () => {
		it('facing8 echo: msg.facing8=up-right with dir=up broadcasts facing8=up-right', () => {
			const ws1 = createMockWs()
			const ws2 = createMockWs()
			joinClient(room, ws1, 'mover')
			joinClient(room, ws2, 'observer')

			const client = [...room.players.values()].find((c) => c.nickname === 'mover')!
			client.lastMove = 0
			ws2.messages.length = 0

			room.handleMessage(
				ws1,
				JSON.stringify({ type: 'move', x: 200, y: 200, dir: 'up', facing8: 'up-right' }),
			)

			const moveMsg = ws2.messages.find((m) => m.type === 'move')
			expect(moveMsg).toBeDefined()
			expect((moveMsg as OutgoingMessage & { facing8?: string }).facing8).toBe('up-right')
		})

		it('facing8 미전송 시 derivedFacing8 포함', () => {
			const ws1 = createMockWs()
			const ws2 = createMockWs()
			joinClient(room, ws1, 'mover')
			joinClient(room, ws2, 'observer')

			const client = [...room.players.values()].find((c) => c.nickname === 'mover')!
			client.lastMove = 0
			ws2.messages.length = 0

			room.handleMessage(ws1, JSON.stringify({ type: 'move', x: 200, y: 200, dir: 'right' }))

			const moveMsg = ws2.messages.find((m) => m.type === 'move')
			expect(moveMsg).toBeDefined()
			expect((moveMsg as OutgoingMessage & { facing8?: string }).facing8).toBe('right')
		})

		it('facing8 inconsistent reject: facing8=up-right with dir=down → reject + counter +1', () => {
			const ws = createMockWs()
			joinClient(room, ws, 'mover')
			const client = [...room.players.values()][0]
			client.lastMove = 0
			const before = client.x
			const beforeCount = metrics.facing8_inconsistent_rejected_total

			room.handleMessage(
				ws,
				JSON.stringify({ type: 'move', x: 200, y: 200, dir: 'down', facing8: 'up-right' }),
			)

			expect(client.x).toBe(before)
			expect(metrics.facing8_inconsistent_rejected_total).toBe(beforeCount + 1)
		})

		it('facing8 invalid reject: facing8=banana → reject + counter +1', () => {
			const ws = createMockWs()
			joinClient(room, ws, 'mover')
			const client = [...room.players.values()][0]
			client.lastMove = 0
			const before = client.x
			const beforeCount = metrics.facing8_invalid_rejected_total

			room.handleMessage(
				ws,
				JSON.stringify({ type: 'move', x: 200, y: 200, dir: 'right', facing8: 'banana' }),
			)

			expect(client.x).toBe(before)
			expect(metrics.facing8_invalid_rejected_total).toBe(beforeCount + 1)
		})

		it('dash 축 cheat reject: dash dir=right 후 dy=10 → reject + counter +1', () => {
			const ws = createMockWs()
			joinClient(room, ws, 'dasher')
			const client = [...room.players.values()][0]

			client.x = 100
			client.y = 100
			client.lastDash = 0

			room.handleMessage(ws, JSON.stringify({ type: 'dash', dir: 'right' }))

			client.lastMove = 0
			const beforeCount = metrics.dash_axis_violation_rejected_total

			room.handleMessage(ws, JSON.stringify({ type: 'move', x: 110, y: 110, dir: 'right' }))

			expect(client.x).toBe(100)
			expect(metrics.dash_axis_violation_rejected_total).toBe(beforeCount + 1)
		})

		it('dash 축 정상 통과: dash dir=right 후 dy=2 → 통과', () => {
			const ws = createMockWs()
			joinClient(room, ws, 'dasher')
			const client = [...room.players.values()][0]

			client.x = 100
			client.y = 100
			client.lastDash = 0

			room.handleMessage(ws, JSON.stringify({ type: 'dash', dir: 'right' }))

			client.lastMove = 0

			room.handleMessage(ws, JSON.stringify({ type: 'move', x: 110, y: 102, dir: 'right' }))

			expect(client.x).toBe(110)
		})

		it('dash 종료 후 자유 이동: dashUntil 지난 후 dy=10도 통과', () => {
			const ws = createMockWs()
			joinClient(room, ws, 'dasher')
			const client = [...room.players.values()][0]

			client.x = 100
			client.y = 100
			client.dashDir = 'right'
			client.dashUntil = Date.now() - 1000
			client.lastMove = 0

			room.handleMessage(ws, JSON.stringify({ type: 'move', x: 110, y: 110, dir: 'down' }))

			expect(client.x).toBe(110)
		})
	})
})

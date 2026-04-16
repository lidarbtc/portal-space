import { describe, it, expect, beforeEach } from 'vitest'
import { Room } from './room'
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from './protocol'
import type { OutgoingMessage } from '$lib/types'
import type { ServerWebSocket } from 'bun'

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

describe('Room', () => {
	let room: Room

	beforeEach(() => {
		room = new Room('test', MAP_WIDTH, MAP_HEIGHT)
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
})

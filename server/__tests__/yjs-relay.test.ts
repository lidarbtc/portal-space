import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { YjsRelay } from '../yjs-relay'
import { Storage } from '../storage'
import { encodeUpdates } from '../protocol'
import { unlinkSync, existsSync } from 'fs'

const TEST_DB = '/tmp/portal-space-yjs-test.db'

function cleanup() {
	for (const suffix of ['', '-wal', '-shm']) {
		const path = TEST_DB + suffix
		if (existsSync(path)) unlinkSync(path)
	}
}

// Mock WebSocket that collects binary messages
function createMockWs() {
	const messages: Uint8Array[] = []
	let closed = false
	return {
		messages,
		get closed() {
			return closed
		},
		send(data: string | Uint8Array | ArrayBuffer) {
			if (typeof data !== 'string') {
				messages.push(new Uint8Array(data))
			}
		},
		close() {
			closed = true
		},
		// Satisfy type
		data: {},
		readyState: 1,
		remoteAddress: '',
	} as unknown as import('bun').ServerWebSocket<unknown> & {
		messages: Uint8Array[]
		closed: boolean
	}
}

describe('YjsRelay', () => {
	let storage: Storage
	let relay: YjsRelay

	beforeEach(() => {
		cleanup()
		storage = new Storage(TEST_DB)
		relay = new YjsRelay(storage, ['wb-1', 'wb-2'])
	})

	afterEach(() => {
		storage.close()
		cleanup()
	})

	it('rejects connection to unknown board', () => {
		const ws = createMockWs()
		relay.handleConnection(ws, 'wb-unknown')
		expect(ws.closed).toBe(true)
	})

	it('accepts connection to valid board', () => {
		const ws = createMockWs()
		relay.handleConnection(ws, 'wb-1')
		expect(ws.closed).toBe(false)
		// Should receive SyncStep1 (empty state vector)
		expect(ws.messages.length).toBeGreaterThanOrEqual(1)
		const lastMsg = ws.messages[ws.messages.length - 1]
		// SyncStep1 with empty state vector: [0x00, 0x00, 0x00]
		expect(lastMsg).toEqual(new Uint8Array([0x00, 0x00, 0x00]))
	})

	it('sendFullState sends docState as SyncStep2 then SyncStep1', () => {
		// Pre-seed a room with state via storage
		const docState = new Uint8Array([10, 20, 30])
		storage.upsertDocument('wb-1', Buffer.from(docState), null)

		// Recreate relay to load from storage
		const relay2 = new YjsRelay(storage, ['wb-1', 'wb-2'])
		const ws = createMockWs()
		relay2.handleConnection(ws, 'wb-1')

		// Should receive: SyncStep2(docState) + SyncStep1(empty)
		expect(ws.messages.length).toBeGreaterThanOrEqual(2)

		// First message: SyncStep2 with docState
		const step2 = ws.messages[0]
		expect(step2[0]).toBe(0x00) // MSG_SYNC
		expect(step2[1]).toBe(0x01) // SYNC_STEP2
		expect(step2.slice(2)).toEqual(docState)

		// Last message: SyncStep1 with empty state vector
		const step1 = ws.messages[ws.messages.length - 1]
		expect(step1).toEqual(new Uint8Array([0x00, 0x00, 0x00]))
	})

	it('SyncStep2 replaces docState and clears buffer', () => {
		const ws1 = createMockWs()
		const ws2 = createMockWs()
		relay.handleConnection(ws1, 'wb-1')
		relay.handleConnection(ws2, 'wb-1')

		// Send an incremental update first
		const update = new Uint8Array([0x00, 0x02, 0xaa, 0xbb])
		relay.handleMessage(ws1, 'wb-1', update)

		// Now send SyncStep2 (full state)
		const fullState = new Uint8Array([0x00, 0x01, 0x01, 0x02, 0x03])
		ws2.messages.length = 0
		relay.handleMessage(ws1, 'wb-1', fullState)

		// ws2 should have received the SyncStep2 broadcast
		const received = ws2.messages.find((m) => m[0] === 0x00 && m[1] === 0x01)
		expect(received).toBeDefined()
	})

	it('SyncUpdate appends to buffer and broadcasts', () => {
		const ws1 = createMockWs()
		const ws2 = createMockWs()
		relay.handleConnection(ws1, 'wb-1')
		relay.handleConnection(ws2, 'wb-1')
		ws2.messages.length = 0

		// Send incremental update
		const update = new Uint8Array([0x00, 0x02, 0xcc, 0xdd])
		relay.handleMessage(ws1, 'wb-1', update)

		// ws2 should receive the update
		expect(ws2.messages.some((m) => m[0] === 0x00 && m[1] === 0x02 && m[2] === 0xcc)).toBe(true)
	})

	it('Awareness messages are broadcast to others', () => {
		const ws1 = createMockWs()
		const ws2 = createMockWs()
		relay.handleConnection(ws1, 'wb-1')
		relay.handleConnection(ws2, 'wb-1')
		ws2.messages.length = 0

		const awareness = new Uint8Array([0x01, 0x05, 0x06, 0x07])
		relay.handleMessage(ws1, 'wb-1', awareness)

		expect(ws2.messages.some((m) => m[0] === 0x01 && m[1] === 0x05)).toBe(true)
		// Sender should NOT receive their own broadcast
		expect(ws1.messages.filter((m) => m[0] === 0x01 && m[1] === 0x05)).toHaveLength(0)
	})

	it('persists state on last client disconnect', async () => {
		const ws = createMockWs()
		relay.handleConnection(ws, 'wb-1')

		// Send a SyncStep2 to set docState
		relay.handleMessage(ws, 'wb-1', new Uint8Array([0x00, 0x01, 0xaa, 0xbb]))

		// Disconnect — last client (persist is async via setImmediate)
		relay.handleClose(ws, 'wb-1')

		// Wait for setImmediate to flush
		await new Promise((resolve) => setImmediate(resolve))

		// Check SQLite
		const doc = storage.getDocument('wb-1')
		expect(doc).toBeDefined()
		expect(Buffer.from(doc!.docState)).toEqual(Buffer.from([0xaa, 0xbb]))
	})

	it('loads persisted state on restart', () => {
		// Persist some state
		const docState = new Uint8Array([0x11, 0x22, 0x33])
		const updates = [new Uint8Array([0x44]), new Uint8Array([0x55, 0x66])]
		const updatesBlob = encodeUpdates(updates)!

		storage.upsertDocument('wb-2', Buffer.from(docState), Buffer.from(updatesBlob))

		// Create new relay (simulates restart)
		const relay2 = new YjsRelay(storage, ['wb-1', 'wb-2'])
		const ws = createMockWs()
		relay2.handleConnection(ws, 'wb-2')

		// Should receive: SyncStep2(docState) + 2 SyncUpdates + SyncStep1
		expect(ws.messages.length).toBe(4)

		// First: SyncStep2 with docState
		expect(ws.messages[0][0]).toBe(0x00) // MSG_SYNC
		expect(ws.messages[0][1]).toBe(0x01) // SYNC_STEP2
		expect(ws.messages[0].slice(2)).toEqual(docState)

		// Second & third: SyncUpdates
		expect(ws.messages[1][0]).toBe(0x00) // MSG_SYNC
		expect(ws.messages[1][1]).toBe(0x02) // SYNC_UPDATE
		expect(ws.messages[1].slice(2)).toEqual(updates[0])

		expect(ws.messages[2][0]).toBe(0x00)
		expect(ws.messages[2][1]).toBe(0x02)
		expect(ws.messages[2].slice(2)).toEqual(updates[1])

		// Last: SyncStep1
		expect(ws.messages[3]).toEqual(new Uint8Array([0x00, 0x00, 0x00]))
	})

	it('enforces 1MB message limit', () => {
		const ws1 = createMockWs()
		const ws2 = createMockWs()
		relay.handleConnection(ws1, 'wb-1')
		relay.handleConnection(ws2, 'wb-1')
		ws2.messages.length = 0

		// Send oversized message (>1MB)
		const oversized = new Uint8Array(1_048_577 + 2)
		oversized[0] = 0x00
		oversized[1] = 0x02
		relay.handleMessage(ws1, 'wb-1', oversized)

		// ws2 should NOT have received anything
		expect(ws2.messages).toHaveLength(0)
	})
})

// Y.js binary WebSocket relay — opaque blob forwarder
// ⚠️ MUST NOT interpret message contents beyond bytes 0-1 (msgType, syncType)
// The y-websocket client (WebsocketProvider) uses lib0 encoding internally.

import type { ServerWebSocket } from 'bun'
import type { Storage } from './storage'
import { encodeUpdates, decodeUpdates, MAX_YJS_MESSAGE_BYTES } from './protocol'

// y-websocket message type prefixes
const MSG_SYNC = 0
const MSG_AWARENESS = 1
const SYNC_STEP1 = 0
const SYNC_STEP2 = 1
const SYNC_UPDATE = 2

interface YjsClient {
	ws: ServerWebSocket<unknown>
}

interface YjsRoom {
	clients: Set<YjsClient>
	docState: Uint8Array | null // base state (from SyncStep2)
	updates: Uint8Array[] // buffered incremental updates since last full state
}

export class YjsRelay {
	#rooms = new Map<string, YjsRoom>()
	#storage: Storage
	#validBoards: Set<string>
	// Map ws → { boardId, client } for fast lookup on message/close
	#wsBySocket = new Map<ServerWebSocket<unknown>, { boardId: string; client: YjsClient }>()

	constructor(storage: Storage, validBoardIds: string[]) {
		this.#storage = storage
		this.#validBoards = new Set(validBoardIds)
		this.#loadFromStorage()
	}

	#loadFromStorage(): void {
		try {
			let count = 0
			for (const boardId of this.#validBoards) {
				const doc = this.#storage.getDocument(boardId)
				if (doc) {
					const room: YjsRoom = {
						clients: new Set(),
						docState: new Uint8Array(doc.docState),
						updates: doc.updatesBlob ? decodeUpdates(new Uint8Array(doc.updatesBlob)) : [],
					}
					this.#rooms.set(boardId, room)
					count++
				}
			}
			if (count > 0) {
				console.log(`[yjs] loaded ${count} document states`)
			}
		} catch (e) {
			console.warn('[yjs] failed to load documents:', e)
		}
	}

	#getRoom(boardId: string): YjsRoom {
		let room = this.#rooms.get(boardId)
		if (!room) {
			room = { clients: new Set(), docState: null, updates: [] }
			this.#rooms.set(boardId, room)
		}
		return room
	}

	handleConnection(ws: ServerWebSocket<unknown>, boardId: string): void {
		if (!this.#validBoards.has(boardId)) {
			ws.close()
			return
		}

		const room = this.#getRoom(boardId)
		const client: YjsClient = { ws }
		room.clients.add(client)
		this.#wsBySocket.set(ws, { boardId, client })

		// Send stored state to new client
		this.#sendFullState(room, client)
	}

	handleMessage(ws: ServerWebSocket<unknown>, _boardId: string, data: Uint8Array): void {
		// Enforce 1MB limit
		if (data.byteLength > MAX_YJS_MESSAGE_BYTES) return
		if (data.length < 1) return

		const entry = this.#wsBySocket.get(ws)
		if (!entry) return

		// Use the registered boardId from socket entry, not the parameter (prevents routing mismatches)
		const room = this.#getRoom(entry.boardId)
		const client = entry.client
		const msgType = data[0]

		switch (msgType) {
			case MSG_SYNC: {
				if (data.length < 2) return
				const syncType = data[1]

				switch (syncType) {
					case SYNC_STEP1:
						// Client requests state — send full state
						this.#sendFullState(room, client)
						break

					case SYNC_STEP2: {
						// Full state from client — replace base state, clear update buffer
						const update = data.slice(2)
						if (update.length > 0) {
							room.docState = new Uint8Array(update)
							room.updates = [] // clear buffer since we have full state
						}
						this.#broadcast(room, client, data)
						break
					}

					case SYNC_UPDATE: {
						// Incremental update — buffer AND broadcast
						const update = data.slice(2)
						if (update.length > 0) {
							room.updates.push(new Uint8Array(update))
						}
						this.#broadcast(room, client, data)
						break
					}
				}
				break
			}

			case MSG_AWARENESS:
				this.#broadcast(room, client, data)
				break
		}
	}

	handleClose(ws: ServerWebSocket<unknown>, boardId: string): void {
		const entry = this.#wsBySocket.get(ws)
		if (!entry) return

		const room = this.#getRoom(boardId)
		room.clients.delete(entry.client)
		this.#wsBySocket.delete(ws)

		// Persist state when last client leaves
		if (room.clients.size === 0) {
			this.#persistState(boardId, room)
		}
	}

	#sendFullState(room: YjsRoom, client: YjsClient): void {
		// Send base state as SyncStep2 (raw bytes, no re-encoding)
		if (room.docState && room.docState.length > 0) {
			const msg = new Uint8Array(2 + room.docState.length)
			msg[0] = MSG_SYNC
			msg[1] = SYNC_STEP2
			msg.set(room.docState, 2)
			try {
				client.ws.send(msg)
			} catch {
				/* */
			}
		}

		// Replay all buffered incremental updates (raw bytes)
		for (const update of room.updates) {
			const msg = new Uint8Array(2 + update.length)
			msg[0] = MSG_SYNC
			msg[1] = SYNC_UPDATE
			msg.set(update, 2)
			try {
				client.ws.send(msg)
			} catch {
				/* */
			}
		}

		// Send SyncStep1 with empty state vector to prompt client to respond
		// Wire format: [msgSync=0x00, syncStep1=0x00, varUintLen=0x00]
		// The 0x00 third byte is lib0 writeVarUint8Array with length 0.
		try {
			client.ws.send(new Uint8Array([MSG_SYNC, SYNC_STEP1, 0x00]))
		} catch {
			/* */
		}
	}

	#broadcast(room: YjsRoom, sender: YjsClient, data: Uint8Array): void {
		for (const client of room.clients) {
			if (client === sender) continue
			try {
				client.ws.send(data)
			} catch {
				/* */
			}
		}
	}

	#persistState(boardId: string, room: YjsRoom): void {
		const state = room.docState
		const updatesBlob = encodeUpdates(room.updates)

		if ((state && state.length > 0) || (updatesBlob && updatesBlob.length > 0)) {
			this.#storage.upsertDocumentAsync(
				boardId,
				state ? Buffer.from(state) : Buffer.alloc(0),
				updatesBlob ? Buffer.from(updatesBlob) : null,
			)
		}
	}
}

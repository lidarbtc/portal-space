// ⚠️ ARCHITECTURAL INVARIANT: All methods MUST be synchronous. No async/await.

import type { ServerWebSocket } from 'bun'
import type {
	OutgoingMessage,
	InteractiveObject,
	IncomingMessage,
	ActionMessage,
	ChatImage,
	ColorPalette,
	RegionalChatState,
} from '@shared/types'
import { ServerClient } from './client'
import {
	TILE_SIZE,
	MAX_PLAYERS,
	MOVE_RATE_LIMIT,
	EMOTE_RATE_LIMIT,
	PROFILE_COOLDOWN,
	CUSTOM_STATUS_COOLDOWN,
	SETTINGS_COOLDOWN,
	DASH_DURATION_MS,
	DASH_COOLDOWN_MS,
	MAX_SPEED,
	DASH_SPEED,
	MAX_CUSTOM_STATUS_LEN,
	MAX_NICKNAME_LEN,
	MIN_ZONE_RADIUS,
	MAX_ZONE_RADIUS,
	DOMAIN_REGIONAL_CHAT,
	ACTION_UPDATE_SETTINGS,
	sanitizeNickname,
	sanitizeChat,
	sanitizeString,
	normalizeChatImage,
	validateDirection,
	validateStatus,
	validateEmoji,
	validateAvatar,
	validateColors,
} from './protocol'

export class Room {
	id: string
	players = new Map<string, ServerClient>()
	objects = new Map<string, InteractiveObject>()
	collision: boolean[][]
	width: number
	height: number

	// Map ws → clientId for fast lookup on message/close
	#wsBySocket = new Map<ServerWebSocket<unknown>, string>()

	constructor(id: string, width: number, height: number) {
		this.id = id
		this.width = width
		this.height = height
		this.collision = Array.from({ length: height }, () => new Array<boolean>(width).fill(false))
		this.#initCollisionMap()
	}

	#initCollisionMap(): void {
		for (let x = 0; x < this.width; x++) {
			this.collision[0][x] = true
			this.collision[this.height - 1][x] = true
		}
		for (let y = 0; y < this.height; y++) {
			this.collision[y][0] = true
			this.collision[y][this.width - 1] = true
		}

		const baseTables: [number, number][] = [
			[4, 4],
			[5, 4],
			[4, 7],
			[5, 7],
			[4, 10],
			[5, 10],
			[10, 4],
			[11, 4],
			[10, 7],
			[11, 7],
			[10, 10],
			[11, 10],
			[16, 4],
			[17, 4],
			[16, 7],
			[17, 7],
			[16, 10],
			[17, 10],
		]
		for (let blockY = 0; blockY < Math.floor(this.height / 15); blockY++) {
			for (let blockX = 0; blockX < Math.floor(this.width / 20); blockX++) {
				for (const [fx, fy] of baseTables) {
					const x = fx + blockX * 20
					const y = fy + blockY * 15
					if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
						this.collision[y][x] = true
					}
				}
			}
		}
	}

	isWalkable(x: number, y: number): boolean {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false
		return !this.collision[y][x]
	}

	findSpawnPoint(): [number, number] {
		const cx = Math.floor(this.width / 2)
		const cy = Math.floor(this.height / 2)
		const candidates: [number, number][] = [
			[cx, cy],
			[cx - 1, cy],
			[cx, cy - 1],
			[cx - 1, cy - 1],
			[cx - 2, cy + 2],
			[cx + 2, cy + 2],
			[cx - 2, cy - 2],
			[cx + 2, cy - 2],
			[Math.floor(this.width / 4), Math.floor(this.height / 4)],
			[Math.floor((3 * this.width) / 4), Math.floor(this.height / 4)],
			[Math.floor(this.width / 4), Math.floor((3 * this.height) / 4)],
			[Math.floor((3 * this.width) / 4), Math.floor((3 * this.height) / 4)],
		]
		for (const [x, y] of candidates) {
			if (this.isWalkable(x, y)) {
				return [x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2]
			}
		}
		for (let y = 1; y < this.height - 1; y++) {
			for (let x = 1; x < this.width - 1; x++) {
				if (this.isWalkable(x, y)) {
					return [x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2]
				}
			}
		}
		return [1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2]
	}

	addObject(obj: InteractiveObject): void {
		this.objects.set(obj.id, obj)
	}

	// --- WebSocket message dispatch (replaces Go's readPump) ---

	handleMessage(ws: ServerWebSocket<unknown>, message: string | Buffer): void {
		const raw = typeof message === 'string' ? message : message.toString()
		let msg: IncomingMessage
		try {
			msg = JSON.parse(raw)
		} catch {
			return
		}

		// Join is special — creates the client
		if (msg.type === 'join') {
			this.#handleJoin(ws, msg)
			return
		}

		const clientId = this.#wsBySocket.get(ws)
		if (!clientId) return
		const client = this.players.get(clientId)
		if (!client) return

		switch (msg.type) {
			case 'move':
				this.#handleMove(client, msg.x ?? 0, msg.y ?? 0, msg.dir ?? '')
				break
			case 'status':
				this.#handleStatus(client, msg.status ?? '')
				break
			case 'chat':
				this.#handleChat(client, msg.text ?? '', msg.image)
				break
			case 'emote':
				this.#handleEmote(client, msg.emoji ?? '')
				break
			case 'customStatus':
				this.#handleCustomStatus(client, msg.customStatus ?? '')
				break
			case 'dash':
				this.#handleDash(client, msg.dir ?? '')
				break
			case 'profile': {
				let nickname = sanitizeNickname(msg.nickname ?? '')
				if (!nickname) nickname = client.nickname
				let colors: ColorPalette | null
				if (msg.colors && validateColors(msg.colors)) {
					colors = msg.colors
				} else {
					colors = client.colors
				}
				this.#handleProfile(client, nickname, colors)
				break
			}
			case 'action':
				if (msg.payload) {
					this.#handleAction(client, msg.payload)
				}
				break
		}
	}

	handleClose(ws: ServerWebSocket<unknown>): void {
		const clientId = this.#wsBySocket.get(ws)
		if (!clientId) return
		const client = this.players.get(clientId)
		if (!client) return
		this.#unregister(client)
		this.#wsBySocket.delete(ws)
	}

	// --- Internal handlers ---

	#handleJoin(ws: ServerWebSocket<unknown>, msg: IncomingMessage): void {
		// Prevent double-join: if this socket already has a client, unregister the old one
		const existingId = this.#wsBySocket.get(ws)
		if (existingId) {
			const existingClient = this.players.get(existingId)
			if (existingClient) this.#unregister(existingClient)
			this.#wsBySocket.delete(ws)
		}

		if (this.players.size >= MAX_PLAYERS) {
			const errMsg: OutgoingMessage = { type: 'error', message: 'room is full', x: 0, y: 0 }
			try {
				ws.send(JSON.stringify(errMsg))
			} catch {
				/* */
			}
			ws.close()
			return
		}

		const [spawnX, spawnY] = this.findSpawnPoint()
		const client = new ServerClient(ws, spawnX, spawnY)

		let nickname = sanitizeNickname(msg.nickname ?? '')
		if (!nickname) nickname = 'anonymous'
		client.nickname = nickname

		if (validateAvatar(msg.avatar ?? 0)) {
			client.avatar = msg.avatar ?? 0
		}
		if (msg.colors && validateColors(msg.colors)) {
			client.colors = msg.colors
		}
		client.reconnect = msg.reconnect ?? false

		// Allow custom spawn position if valid (reconnect with saved position)
		if (
			msg.x !== undefined &&
			msg.y !== undefined &&
			(msg.x !== 0 || msg.y !== 0) &&
			this.#validateMove(msg.x, msg.y)
		) {
			const tileX = Math.floor((msg.x ?? 0) / TILE_SIZE)
			const tileY = Math.floor((msg.y ?? 0) / TILE_SIZE)
			if (this.isWalkable(tileX, tileY)) {
				client.x = msg.x ?? 0
				client.y = msg.y ?? 0
			}
		}

		this.#register(client)
	}

	#register(client: ServerClient): void {
		// Snapshot before adding
		const snapshot = this.#snapshot()
		this.players.set(client.id, client)
		this.#wsBySocket.set(client.ws, client.id)

		// Collect objects
		const objects = [...this.objects.values()]

		// Send snapshot to joining client
		client.sendMsg({
			type: 'snapshot',
			x: 0,
			y: 0,
			players: snapshot,
			objects,
			self: client.toPlayerInfo(),
		})

		// Broadcast join to others
		const joinMsg: OutgoingMessage = {
			type: 'join',
			x: 0,
			y: 0,
			player: client.toPlayerInfo(),
			reconnect: client.reconnect,
		}
		for (const c of this.players.values()) {
			if (c.id !== client.id) c.sendMsg(joinMsg)
		}

		// Evaluate zone membership
		this.#updateZoneMembership(client)
	}

	#unregister(client: ServerClient): void {
		// Notify zone members if player was in a zone
		if (client.currentZoneID) {
			const obj = this.objects.get(client.currentZoneID)
			let zoneName = ''
			if (obj?.state) {
				const state = obj.state as RegionalChatState
				zoneName = state.name ?? ''
			}
			const exitNotify: OutgoingMessage = {
				type: 'chat',
				x: 0,
				y: 0,
				isSystem: true,
				zoneId: client.currentZoneID,
				zoneName,
				text: client.nickname + '님이 퇴장했습니다',
			}
			for (const c of this.players.values()) {
				if (c.id !== client.id && c.currentZoneID === client.currentZoneID) {
					c.sendMsg(exitNotify)
				}
			}
			client.currentZoneID = ''
		}

		const existed = this.players.delete(client.id)
		if (existed) {
			this.#broadcast({
				type: 'leave',
				x: 0,
				y: 0,
				id: client.id,
			})
		}
	}

	#handleMove(client: ServerClient, x: number, y: number, dir: string): void {
		if (!this.#validateMove(x, y)) return
		if (!validateDirection(dir)) return

		const now = Date.now()
		const elapsed = now - client.lastMove

		// Speed validation (only if we have a previous move within 2 seconds)
		if (client.lastMove > 0 && elapsed < 2000 && elapsed > 0) {
			const dx = x - client.x
			const dy = y - client.y
			const dist = Math.sqrt(dx * dx + dy * dy)
			const speed = dist / (elapsed / 1000)
			const maxSpeed = now < client.dashUntil ? DASH_SPEED : MAX_SPEED
			if (speed > maxSpeed) return
		}

		// Rate limit: 1/MOVE_RATE_LIMIT seconds between moves
		if (elapsed < 1000 / MOVE_RATE_LIMIT) return
		client.lastMove = now

		client.x = x
		client.y = y
		client.dir = dir

		this.#broadcast({ type: 'move', id: client.id, x, y, dir: dir as OutgoingMessage['dir'] })

		this.#updateZoneMembership(client)
	}

	#handleStatus(client: ServerClient, status: string): void {
		if (!validateStatus(status)) return
		client.status = status
		this.#broadcast({
			type: 'status',
			x: 0,
			y: 0,
			id: client.id,
			status: status as OutgoingMessage['status'],
		})
	}

	#handleEmote(client: ServerClient, emoji: string): void {
		if (!validateEmoji(emoji)) return
		const now = Date.now()
		if (now - client.lastEmote < 1000 / EMOTE_RATE_LIMIT) return
		client.lastEmote = now
		this.#broadcast({
			type: 'emote',
			x: 0,
			y: 0,
			id: client.id,
			emoji: emoji as OutgoingMessage['emoji'],
		})
	}

	#handleProfile(client: ServerClient, nickname: string, colors: ColorPalette | null): void {
		const now = Date.now()
		if (now - client.lastProfile < PROFILE_COOLDOWN * 1000) return
		client.lastProfile = now
		client.nickname = nickname
		client.colors = colors
		this.#broadcast({
			type: 'profile',
			x: 0,
			y: 0,
			id: client.id,
			nickname,
			player: client.toPlayerInfo(),
		})
	}

	#handleDash(client: ServerClient, dir: string): void {
		if (!validateDirection(dir)) return
		const now = Date.now()
		if (now - client.lastDash < DASH_COOLDOWN_MS) return
		client.lastDash = now
		client.dashUntil = now + DASH_DURATION_MS
		this.#broadcast({
			type: 'dash',
			x: client.x,
			y: client.y,
			id: client.id,
			dir: dir as OutgoingMessage['dir'],
		})
	}

	#handleCustomStatus(client: ServerClient, text: string): void {
		const now = Date.now()
		if (now - client.lastCustomStatus < CUSTOM_STATUS_COOLDOWN * 1000) return
		client.lastCustomStatus = now
		text = sanitizeString(text, MAX_CUSTOM_STATUS_LEN)
		client.customStatus = text
		this.#broadcast({ type: 'customStatus', x: 0, y: 0, id: client.id, customStatus: text })
	}

	#handleChat(client: ServerClient, text: string, image?: ChatImage): void {
		text = sanitizeChat(text)
		const normalizedImage = normalizeChatImage(image)

		if (image && !normalizedImage) return
		if (!text && !normalizedImage) return

		// Zone chat: direct-send to zone members only
		if (client.currentZoneID) {
			const obj = this.objects.get(client.currentZoneID)
			let zoneName = ''
			if (obj?.state) {
				const state = obj.state as RegionalChatState
				zoneName = state.name ?? ''
			}
			const msg: OutgoingMessage = {
				type: 'chat',
				x: 0,
				y: 0,
				id: client.id,
				nickname: client.nickname,
				zoneId: client.currentZoneID,
				zoneName,
			}
			if (text) msg.text = text
			if (normalizedImage) msg.image = normalizedImage
			for (const c of this.players.values()) {
				if (c.currentZoneID === client.currentZoneID) {
					c.sendMsg(msg)
				}
			}
			return
		}

		// Global chat: broadcast to all
		const msg: OutgoingMessage = {
			type: 'chat',
			x: 0,
			y: 0,
			id: client.id,
			nickname: client.nickname,
		}
		if (text) msg.text = text
		if (normalizedImage) msg.image = normalizedImage
		this.#broadcast(msg)
	}

	#handleAction(client: ServerClient, raw: string | unknown): void {
		let action: ActionMessage
		try {
			action = typeof raw === 'string' ? JSON.parse(raw) : (raw as ActionMessage)
		} catch {
			return
		}

		if (action.domain === DOMAIN_REGIONAL_CHAT) {
			this.#handleRegionalChatAction(client, action)
		}
	}

	#handleRegionalChatAction(client: ServerClient, action: ActionMessage): void {
		if (action.action !== ACTION_UPDATE_SETTINGS) return

		const obj = this.objects.get(action.objectId ?? '')
		if (!obj || obj.type !== 'regional_chat') return

		// Rate limit
		const now = Date.now()
		if (now - client.lastSettingsUpdate < SETTINGS_COOLDOWN * 1000) return
		client.lastSettingsUpdate = now

		// Proximity check
		const dx = client.x - obj.x
		const dy = client.y - obj.y
		const dist = Math.sqrt(dx * dx + dy * dy)
		if (dist > 1.5 * TILE_SIZE) return

		// Parse new settings
		const payload = action.payload as RegionalChatState | undefined
		if (!payload) return

		let name = sanitizeString(payload.name ?? '', MAX_NICKNAME_LEN)
		if (!name) name = '결계석'
		let radius = payload.radius ?? 0
		if (radius < MIN_ZONE_RADIUS) radius = MIN_ZONE_RADIUS
		if (radius > MAX_ZONE_RADIUS) radius = MAX_ZONE_RADIUS

		const newState: RegionalChatState = {
			name,
			radius,
			retainHistory: payload.retainHistory ?? false,
		}

		obj.state = newState

		// Broadcast updated object
		this.#broadcast({
			type: 'action',
			x: 0,
			y: 0,
			actionPayload: {
				domain: DOMAIN_REGIONAL_CHAT,
				action: 'state_updated',
				objectId: obj.id,
				payload: newState,
			},
			objects: [obj],
		})

		// Re-evaluate all players' zone membership
		for (const c of this.players.values()) {
			this.#updateZoneMembership(c)
		}
	}

	#updateZoneMembership(client: ServerClient): void {
		// If player is already in a zone, check if they left
		if (client.currentZoneID) {
			const obj = this.objects.get(client.currentZoneID)
			let stillInside = false
			let zoneName = ''

			if (obj?.state) {
				const state = obj.state as RegionalChatState
				zoneName = state.name ?? ''
				const dx = client.x - obj.x
				const dy = client.y - obj.y
				const dist = Math.sqrt(dx * dx + dy * dy)
				stillInside = dist <= state.radius
			}

			if (stillInside) return

			// Left the zone — notify player
			client.sendMsg({
				type: 'chat',
				x: 0,
				y: 0,
				isSystem: true,
				zoneId: client.currentZoneID,
				zoneName,
				zoneEvent: 'exit',
				text: zoneName + '에서 퇴장했습니다',
			})
			// Notify remaining zone members
			const exitNotify: OutgoingMessage = {
				type: 'chat',
				x: 0,
				y: 0,
				isSystem: true,
				zoneId: client.currentZoneID,
				zoneName,
				text: client.nickname + '님이 퇴장했습니다',
			}
			for (const c of this.players.values()) {
				if (c.id !== client.id && c.currentZoneID === client.currentZoneID) {
					c.sendMsg(exitNotify)
				}
			}
			client.currentZoneID = ''
		}

		// Try to enter a new zone
		for (const obj of this.objects.values()) {
			if (obj.type !== 'regional_chat') continue
			const state = obj.state as RegionalChatState | undefined
			if (!state) continue

			const dx = client.x - obj.x
			const dy = client.y - obj.y
			const dist = Math.sqrt(dx * dx + dy * dy)
			if (dist <= state.radius) {
				client.currentZoneID = obj.id
				// Notify the player
				client.sendMsg({
					type: 'chat',
					x: 0,
					y: 0,
					isSystem: true,
					zoneId: obj.id,
					zoneName: state.name,
					zoneEvent: 'enter',
					text: state.name + '에 입장했습니다',
				})
				// Notify existing zone members
				const enterNotify: OutgoingMessage = {
					type: 'chat',
					x: 0,
					y: 0,
					isSystem: true,
					zoneId: obj.id,
					zoneName: state.name,
					text: client.nickname + '님이 입장했습니다',
				}
				for (const c of this.players.values()) {
					if (c.id !== client.id && c.currentZoneID === obj.id) {
						c.sendMsg(enterNotify)
					}
				}
				break
			}
		}
	}

	#validateMove(x: number, y: number): boolean {
		const pw = this.width * TILE_SIZE
		const ph = this.height * TILE_SIZE
		return x >= 0 && x < pw && y >= 0 && y < ph
	}

	#snapshot(): ReturnType<ServerClient['toPlayerInfo']>[] {
		return [...this.players.values()].map((c) => c.toPlayerInfo())
	}

	#broadcast(msg: OutgoingMessage): void {
		for (const client of this.players.values()) {
			client.sendMsg(msg)
		}
	}

	closeAll(): void {
		for (const client of this.players.values()) {
			try {
				client.ws.close()
			} catch {
				/* */
			}
		}
	}
}

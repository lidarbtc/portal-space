import type { ServerWebSocket } from 'bun'
import type { ColorPalette, OutgoingMessage, PlayerInfo } from '@shared/types'

export class ServerClient {
	id: string
	nickname = ''
	x: number
	y: number
	status = 'online'
	dir = 'down'
	avatar = 0
	colors: ColorPalette | null = null
	customStatus = ''

	reconnect = false
	currentZoneID = ''

	lastMove = 0
	lastEmote = 0
	lastProfile = 0
	lastCustomStatus = 0
	lastSettingsUpdate = 0
	lastDash = 0
	dashUntil = 0

	ws: ServerWebSocket<unknown>

	constructor(ws: ServerWebSocket<unknown>, spawnX: number, spawnY: number) {
		this.ws = ws
		this.id = crypto.randomUUID().slice(0, 8)
		this.x = spawnX
		this.y = spawnY
	}

	sendMsg(msg: OutgoingMessage): void {
		try {
			this.ws.send(JSON.stringify(msg))
		} catch {
			// Connection may be closed — silently drop
		}
	}

	toPlayerInfo(): PlayerInfo {
		return {
			id: this.id,
			nickname: this.nickname,
			x: this.x,
			y: this.y,
			status: this.status as PlayerInfo['status'],
			dir: this.dir as PlayerInfo['dir'],
			avatar: this.avatar,
			colors: this.colors ?? undefined,
			customStatus: this.customStatus || undefined,
		}
	}
}

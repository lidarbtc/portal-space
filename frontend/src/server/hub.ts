import type { InteractiveObject, RegionalChatState } from '$lib/types'
import type { Storage } from './storage'
import { Room } from './room'
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from './protocol'

export class Hub {
	rooms = new Map<string, Room>()
	storage: Storage

	constructor(storage: Storage) {
		this.storage = storage

		// Create default room
		const defaultRoom = new Room('default', MAP_WIDTH, MAP_HEIGHT)
		this.rooms.set('default', defaultRoom)

		// Place whiteboards near map center
		defaultRoom.addObject({
			id: 'wb-1',
			type: 'whiteboard',
			x: 28 * TILE_SIZE,
			y: 24 * TILE_SIZE,
		})
		defaultRoom.addObject({
			id: 'wb-2',
			type: 'whiteboard',
			x: 34 * TILE_SIZE,
			y: 24 * TILE_SIZE,
		})

		// Place a regional chat zone
		const rcState: RegionalChatState = {
			name: '결계석',
			radius: 80,
			retainHistory: false,
		}
		defaultRoom.addObject({
			id: 'rc-1',
			type: 'regional_chat',
			x: 21 * TILE_SIZE,
			y: 16 * TILE_SIZE,
			state: rcState,
		} as InteractiveObject)
	}

	defaultRoom(): Room | null {
		return this.rooms.get('default') ?? null
	}

	closeAll(): void {
		for (const room of this.rooms.values()) {
			room.closeAll()
		}
	}
}

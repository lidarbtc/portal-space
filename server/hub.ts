import type { ObjectsConfig } from '@shared/config'
import type { Storage } from './storage'
import { Room } from './room'
import { loadObjects } from './objects-config'
import { MAP_WIDTH, MAP_HEIGHT } from './protocol'

export class Hub {
	rooms = new Map<string, Room>()
	storage: Storage
	config: ObjectsConfig

	constructor(storage: Storage, config: ObjectsConfig, tiledJson: unknown) {
		this.storage = storage
		this.config = config

		const defaultRoom = new Room({
			id: 'default',
			width: MAP_WIDTH,
			height: MAP_HEIGHT,
			storage,
			config,
		})
		this.rooms.set('default', defaultRoom)

		for (const obj of loadObjects(tiledJson, storage, config, 'default')) {
			defaultRoom.addObject(obj)
		}
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

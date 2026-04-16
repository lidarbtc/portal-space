import type { Direction } from '@shared/types'

class DpadStore {
	direction = $state<Direction | null>(null)
}

export const dpadState = new DpadStore()

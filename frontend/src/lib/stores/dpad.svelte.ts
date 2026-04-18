import type { IntentVector } from '@shared/types'

class DpadStore {
	intent = $state<IntentVector>({ x: 0, y: 0 })
}

export const dpadState = new DpadStore()

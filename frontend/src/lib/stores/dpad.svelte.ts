import type { Direction } from '$lib/types';

class DpadStore {
  direction = $state<Direction | null>(null);
}

export const dpadState = new DpadStore();

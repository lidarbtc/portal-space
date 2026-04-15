import { SvelteMap } from 'svelte/reactivity';
import type { InteractiveObject } from '$lib/types';

class ObjectsStore {
  objects = new SvelteMap<string, InteractiveObject>();
  nearbyObjectId = $state<string | null>(null);
  activeObjectId = $state<string | null>(null);
}

export const objectsState = new ObjectsStore();

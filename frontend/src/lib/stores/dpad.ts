import { writable } from 'svelte/store';
import type { Direction } from '$lib/types';

export const dpadDirection = writable<Direction | null>(null);

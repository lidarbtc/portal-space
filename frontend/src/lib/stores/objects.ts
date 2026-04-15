import { writable } from 'svelte/store'
import type { InteractiveObject } from '$lib/types'

// Interactive objects in the current room
export const interactiveObjects = writable<Map<string, InteractiveObject>>(new Map())

// Currently focused object (player is nearby)
export const nearbyObjectId = writable<string | null>(null)

// Currently active/open object (UI panel is open)
export const activeObjectId = writable<string | null>(null)

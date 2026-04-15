import { writable } from 'svelte/store'

function createPersistedStore(key: string, initial: number) {
	const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
	const value = saved !== null ? parseFloat(saved) : initial
	const store = writable(isFinite(value) ? value : initial)

	store.subscribe((v) => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(key, String(v))
		}
	})

	return store
}

function createPersistedBoolStore(key: string, initial: boolean) {
	const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
	const value = saved !== null ? saved === 'true' : initial
	const store = writable(value)

	store.subscribe((v) => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(key, v ? 'true' : 'false')
		}
	})

	return store
}

export const volume = createPersistedStore('audio-volume', 0.5)
export const muted = createPersistedBoolStore('audio-muted', false)

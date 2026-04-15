import { writable } from 'svelte/store'

export const ZOOM_STEPS = [0.5, 1, 2] as const

const STORAGE_KEY = 'camera-zoom'

function createZoomStore() {
	const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
	const parsed = saved !== null ? parseFloat(saved) : 1
	const initial = (ZOOM_STEPS as readonly number[]).includes(parsed) ? parsed : 1
	const store = writable(initial)

	store.subscribe((v) => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, String(v))
		}
	})

	return store
}

export const zoomLevel = createZoomStore()

export function computeMinZoom(
	viewportW: number,
	viewportH: number,
	mapW: number,
	mapH: number,
): number {
	if (mapW === 0 || mapH === 0) return 1
	return Math.max(viewportW / mapW, viewportH / mapH)
}

export function getAvailableSteps(minZoom: number): number[] {
	return ZOOM_STEPS.filter((s) => s >= minZoom)
}

export function clampZoom(level: number, minZoom: number): number {
	const available = getAvailableSteps(minZoom)
	if (available.length === 0) return ZOOM_STEPS[ZOOM_STEPS.length - 1]
	if (available.includes(level)) return level
	return available[0]
}

export function zoomIn() {
	zoomLevel.update((current) => {
		const idx = (ZOOM_STEPS as readonly number[]).indexOf(current)
		if (idx >= 0 && idx < ZOOM_STEPS.length - 1) return ZOOM_STEPS[idx + 1]
		return current
	})
}

export function zoomOut() {
	zoomLevel.update((current) => {
		const idx = (ZOOM_STEPS as readonly number[]).indexOf(current)
		if (idx > 0) return ZOOM_STEPS[idx - 1]
		return current
	})
}

export function resetZoom() {
	zoomLevel.set(1)
}

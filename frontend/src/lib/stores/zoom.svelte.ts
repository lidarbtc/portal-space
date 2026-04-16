import { PersistedState } from 'runed'

export const ZOOM_STEPS = [0.5, 1, 2] as const

class ZoomStore {
	#level = new PersistedState('camera-zoom', 1)

	get level() {
		return this.#level.current
	}
	set level(v: number) {
		if (!(ZOOM_STEPS as readonly number[]).includes(v)) return
		this.#level.current = v
	}

	zoomIn() {
		const idx = (ZOOM_STEPS as readonly number[]).indexOf(this.level)
		if (idx >= 0 && idx < ZOOM_STEPS.length - 1) this.level = ZOOM_STEPS[idx + 1]
	}

	zoomOut() {
		const idx = (ZOOM_STEPS as readonly number[]).indexOf(this.level)
		if (idx > 0) this.level = ZOOM_STEPS[idx - 1]
	}

	resetZoom() {
		this.level = 1
	}
}

export const zoomState = new ZoomStore()

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

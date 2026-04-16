import { PersistedState } from 'runed'

class SettingsStore {
	#volume = new PersistedState('audio-volume', 0.5)
	#muted = new PersistedState('audio-muted', false)

	get volume() {
		return this.#volume.current
	}
	set volume(v: number) {
		this.#volume.current = v
	}

	get muted() {
		return this.#muted.current
	}
	set muted(v: boolean) {
		this.#muted.current = v
	}
}

export const settingsState = new SettingsStore()

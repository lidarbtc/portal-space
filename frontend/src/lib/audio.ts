import { settingsState } from './stores/settings.svelte'

class NotifyAudio {
	#audio: HTMLAudioElement | null = null
	#lastPlay = 0

	playIfHidden(): void {
		const isMuted = settingsState.muted
		const vol = settingsState.volume

		if ((!document.hidden && document.hasFocus()) || isMuted || vol <= 0) return

		const now = Date.now()
		if (now - this.#lastPlay < 500) return
		this.#lastPlay = now

		try {
			if (!this.#audio) {
				this.#audio = new Audio('/assets/noti_1.wav')
			}
			this.#audio.volume = vol
			this.#audio.currentTime = 0
			this.#audio.play().catch(() => {})
		} catch {
			// Silently fail if audio is unavailable
		}
	}
}

export const notifyAudio = new NotifyAudio()

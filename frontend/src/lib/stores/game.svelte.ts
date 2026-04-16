import { SvelteMap } from 'svelte/reactivity'
import type { PlayerInfo, PlayerStatus, ChatImage } from '@shared/types'
import type { ChatMessage } from '$lib/types'

const MAX_CHAT_MESSAGES = 50

export class GameStore {
	players = $state(new SvelteMap<string, PlayerInfo>())
	selfId = $state<string | null>(null)
	chatMessages = $state<ChatMessage[]>([])
	currentStatus = $state<PlayerStatus>('online')
	currentCustomStatus = $state<string>('')
	chatInputActive = $state(false)

	get playerCount() {
		return this.players.size
	}

	addChatMessage({
		senderId,
		nickname,
		nicknameColor,
		text,
		image,
	}: {
		senderId?: string
		nickname: string
		nicknameColor?: string
		text?: string
		image?: ChatImage
	}): void {
		if (!text && !image) return

		const updated = [
			...this.chatMessages,
			{
				senderId,
				nickname,
				nicknameColor,
				text,
				image,
				isSystem: false,
				timestamp: Date.now(),
			},
		]
		if (updated.length > MAX_CHAT_MESSAGES) {
			this.chatMessages = updated.slice(updated.length - MAX_CHAT_MESSAGES)
		} else {
			this.chatMessages = updated
		}
	}

	addSystemMessage(text: string): void {
		const updated = [...this.chatMessages, { text, isSystem: true, timestamp: Date.now() }]
		if (updated.length > MAX_CHAT_MESSAGES) {
			this.chatMessages = updated.slice(updated.length - MAX_CHAT_MESSAGES)
		} else {
			this.chatMessages = updated
		}
	}
}

export const gameState = new GameStore()

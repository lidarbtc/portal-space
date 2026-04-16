import type { ChatImage } from '@shared/types'
import type { ChatMessage, ChatChannel } from '$lib/types'

const MAX_REGIONAL_MESSAGES = 50

class RegionalChatStore {
	currentZoneId = $state<string | null>(null)
	currentZoneName = $state<string | null>(null)
	activeChatTab = $state<ChatChannel>('global')
	regionalMessages = $state<ChatMessage[]>([])
	settingsOpen = $state(false)
	currentRegionalChatId = $state<string | null>(null)

	addRegionalMessage({
		senderId,
		nickname,
		nicknameColor,
		text,
		image,
		isSystem = false,
	}: {
		senderId?: string
		nickname?: string
		nicknameColor?: string
		text?: string
		image?: ChatImage
		isSystem?: boolean
	}): void {
		if (!text && !image) return

		const updated = [
			...this.regionalMessages,
			{
				senderId,
				nickname,
				nicknameColor,
				text,
				image,
				isSystem,
				timestamp: Date.now(),
				channel: 'regional' as ChatChannel,
			},
		]
		if (updated.length > MAX_REGIONAL_MESSAGES) {
			this.regionalMessages = updated.slice(updated.length - MAX_REGIONAL_MESSAGES)
		} else {
			this.regionalMessages = updated
		}
	}

	enterZone(zoneId: string, zoneName: string): void {
		this.currentZoneId = zoneId
		this.currentZoneName = zoneName
		this.activeChatTab = 'regional'
	}

	exitZone(): void {
		this.currentZoneId = null
		this.currentZoneName = null
		this.regionalMessages = []
		this.activeChatTab = 'global'
	}
}

export const regionalChatState = new RegionalChatStore()

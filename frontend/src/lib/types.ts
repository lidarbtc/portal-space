import type { ChatImage } from '@shared/types'

// Client-only chat channel type
export type ChatChannel = 'global' | 'regional'

// Client-only chat message for UI
export interface ChatMessage {
	senderId?: string
	nickname?: string
	nicknameColor?: string
	text?: string
	image?: ChatImage
	isSystem: boolean
	timestamp: number
	channel?: ChatChannel
}

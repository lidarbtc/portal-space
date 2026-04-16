// Message types
export type MsgType =
	| 'join'
	| 'leave'
	| 'move'
	| 'dash'
	| 'status'
	| 'chat'
	| 'emote'
	| 'profile'
	| 'customStatus'
	| 'snapshot'
	| 'error'
	| 'action'

export type Direction = 'up' | 'down' | 'left' | 'right'
export type PlayerStatus = 'online' | 'away' | 'dnd'
export type Emoji = '👋' | '☕' | '🔥' | '💻' | '📢'

export interface ChatImage {
	mime: string
	data: string
	size: number
	name?: string
}

export interface ColorPalette {
	body: string
	eye: string
	foot: string
}

// Client -> Server
export interface IncomingMessage {
	type: MsgType
	nickname?: string
	x?: number
	y?: number
	dir?: Direction
	status?: PlayerStatus
	text?: string
	image?: ChatImage
	avatar?: number
	colors?: ColorPalette
	emoji?: Emoji
	customStatus?: string
	reconnect?: boolean
	payload?: string // Action envelope JSON (for type: 'action')
}

// Action envelope for feature-specific messages
export interface ActionMessage {
	domain: string
	action: string
	objectId?: string
	senderId?: string
	payload?: unknown
	// Whiteboard state response fields
	snapshot?: unknown
	strokes?: unknown[]
}

// Interactive object in the game world
export interface InteractiveObject {
	id: string
	type: string
	x: number
	y: number
	state?: unknown
}

// Server -> Client
export interface OutgoingMessage {
	type: MsgType
	id?: string
	nickname?: string
	x: number
	y: number
	dir?: Direction
	status?: PlayerStatus
	text?: string
	image?: ChatImage
	message?: string
	emoji?: Emoji
	customStatus?: string
	colors?: ColorPalette
	player?: PlayerInfo
	players?: PlayerInfo[]
	self?: PlayerInfo
	reconnect?: boolean
	objects?: InteractiveObject[]
	actionPayload?: ActionMessage
	zoneId?: string
	zoneName?: string
	zoneEvent?: 'enter' | 'exit'
	isSystem?: boolean
}

export interface PlayerInfo {
	id: string
	nickname: string
	x: number
	y: number
	status: PlayerStatus
	dir: Direction
	avatar: number
	colors?: ColorPalette
	customStatus?: string
}

// Map constants
export const MAP_WIDTH = 60
export const MAP_HEIGHT = 45
export const MAX_NICKNAME_LEN = 20
export const MAX_CHAT_LEN = 500
export const MAX_CUSTOM_STATUS_LEN = 20
export const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024

// Regional chat zone state
export interface RegionalChatState {
	name: string
	radius: number
	retainHistory: boolean
}

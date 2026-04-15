import { writable, derived } from 'svelte/store'
import { whiteboardOpen } from './whiteboard'
import { regionalChatSettingsOpen } from './regional-chat'

export const settingsModalOpen = writable(false)
export const customStatusModalOpen = writable(false)

export const anyModalOpen = derived(
	[settingsModalOpen, customStatusModalOpen, whiteboardOpen, regionalChatSettingsOpen],
	([$settings, $customStatus, $whiteboard, $regionalChat]) =>
		$settings || $customStatus || $whiteboard || $regionalChat,
)

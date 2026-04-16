import type { WhiteboardDoc } from '$lib/whiteboard/yjs-doc'

export type WhiteboardTool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'text' | 'select'

class WhiteboardStore {
	open = $state(false)
	currentBoardId = $state<string | null>(null)
	currentTool = $state<WhiteboardTool>('pen')
	penColor = $state('#ffffff')
	penWidth = $state(3)
	activeDoc = $state.raw<WhiteboardDoc | null>(null)
}

export const whiteboardState = new WhiteboardStore()

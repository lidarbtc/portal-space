import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export interface WhiteboardDoc {
	ydoc: Y.Doc
	yShapes: Y.Array<Y.Map<unknown>>
	undoManager: Y.UndoManager
	provider: WebsocketProvider
	awareness: WebsocketProvider['awareness']
	destroy: () => void
}

export function createWhiteboardDoc(
	boardId: string,
	nickname: string,
	color: string,
): WhiteboardDoc {
	const ydoc = new Y.Doc()
	const yShapes = ydoc.getArray<Y.Map<unknown>>('shapes')
	const undoManager = new Y.UndoManager(yShapes)

	// y-websocket appends roomName to the URL, so pass base URL and boardId separately
	const wsUrl = buildYjsWsUrl()
	const provider = new WebsocketProvider(wsUrl, boardId, ydoc)
	const awareness = provider.awareness

	// Set local user info for collaboration
	awareness.setLocalStateField('user', { name: nickname, color })

	return {
		ydoc,
		yShapes,
		undoManager,
		provider,
		awareness,
		destroy() {
			awareness.setLocalState(null)
			provider.disconnect()
			provider.destroy()
			ydoc.destroy()
		},
	}
}

function buildYjsWsUrl(): string {
	const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
	const peerMatch = location.pathname.match(/^\/peer\/([^/]+)\//)
	const prefix = peerMatch ? `/peer/${peerMatch[1]}` : ''
	return `${proto}//${location.host}${prefix}/ws/yjs`
}

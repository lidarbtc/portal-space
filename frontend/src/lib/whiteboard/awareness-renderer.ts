import Konva from 'konva'
import type { WebsocketProvider } from 'y-websocket'

interface AwarenessUser {
	name: string
	color: string
	cursor?: { x: number; y: number }
	selection?: string[]
	drawing?: { points: number[]; color: string; width: number }
}

interface CursorDisplay {
	group: Konva.Group
	arrow: Konva.Line
	label: Konva.Label
	drawingLine?: Konva.Line
}

/**
 * Renders remote users' cursors, selections, and in-progress strokes on a Konva layer.
 */
export function createAwarenessRenderer(
	awareness: WebsocketProvider['awareness'],
	layer: Konva.Layer,
	localClientId: number,
): () => void {
	const cursors = new Map<number, CursorDisplay>()

	function update() {
		const states = awareness.getStates() as Map<number, { user?: AwarenessUser }>

		// Remove cursors for disconnected users
		for (const [clientId, cursor] of cursors) {
			if (!states.has(clientId)) {
				cursor.group.destroy()
				cursors.delete(clientId)
			}
		}

		// Update/create cursors for connected users
		for (const [clientId, state] of states) {
			if (clientId === localClientId) continue
			const user = state.user
			if (!user) continue

			let display = cursors.get(clientId)

			if (!display) {
				// Create cursor display
				const group = new Konva.Group()

				const arrow = new Konva.Line({
					points: [0, 0, 0, 12, 4, 9],
					fill: user.color || '#6366f1',
					closed: true,
					stroke: '#000',
					strokeWidth: 0.5,
				})
				group.add(arrow)

				const label = new Konva.Label({ x: 8, y: 14 })
				label.add(
					new Konva.Tag({
						fill: user.color || '#6366f1',
						cornerRadius: 3,
					}),
				)
				label.add(
					new Konva.Text({
						text: user.name || '?',
						fontSize: 11,
						fontFamily: 'MulmaruMono, monospace',
						fill: '#fff',
						padding: 3,
					}),
				)
				group.add(label)

				layer.add(group)
				display = { group, arrow, label }
				cursors.set(clientId, display)
			}

			// Update cursor position
			if (user.cursor) {
				display.group.setAttrs({ x: user.cursor.x, y: user.cursor.y, visible: true })
			} else {
				display.group.visible(false)
			}

			// Render in-progress drawing stroke
			if (user.drawing && user.drawing.points.length >= 4) {
				if (!display.drawingLine) {
					display.drawingLine = new Konva.Line({
						stroke: user.drawing.color,
						strokeWidth: user.drawing.width,
						lineCap: 'round',
						lineJoin: 'round',
						tension: 0.3,
						opacity: 0.6,
						listening: false,
					})
					layer.add(display.drawingLine)
				}
				display.drawingLine.points(user.drawing.points)
				display.drawingLine.stroke(user.drawing.color)
				display.drawingLine.strokeWidth(user.drawing.width)
				display.drawingLine.visible(true)
			} else if (display.drawingLine) {
				display.drawingLine.visible(false)
			}
		}

		layer.batchDraw()
	}

	awareness.on('change', update)
	update()

	return () => {
		awareness.off('change', update)
		for (const cursor of cursors.values()) {
			cursor.group.destroy()
			cursor.drawingLine?.destroy()
		}
		cursors.clear()
	}
}

/**
 * Update local cursor position in awareness.
 */
export function updateLocalCursor(
	awareness: WebsocketProvider['awareness'],
	x: number,
	y: number,
): void {
	awareness.setLocalStateField('user', {
		...(((awareness.getLocalState() as Record<string, unknown>)?.user as object) ?? {}),
		cursor: { x, y },
	})
}

/**
 * Update local in-progress drawing in awareness (ephemeral).
 */
export function updateLocalDrawing(
	awareness: WebsocketProvider['awareness'],
	drawing: { points: number[]; color: string; width: number } | null,
): void {
	awareness.setLocalStateField('user', {
		...(((awareness.getLocalState() as Record<string, unknown>)?.user as object) ?? {}),
		drawing,
	})
}

/**
 * Update local selection in awareness.
 */
export function updateLocalSelection(
	awareness: WebsocketProvider['awareness'],
	selection: string[],
): void {
	awareness.setLocalStateField('user', {
		...(((awareness.getLocalState() as Record<string, unknown>)?.user as object) ?? {}),
		selection,
	})
}

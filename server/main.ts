import type { ServerWebSocket } from 'bun'
import { loadObjectConfig } from '@shared/config'
import { Hub } from './hub'
import { Storage } from './storage'
import { YjsRelay } from './yjs-relay'
import { MAX_INCOMING_WS_MESSAGE_BYTES } from './protocol'
import { join } from 'path'
import { existsSync } from 'fs'

type WsData = { type: 'game' } | { type: 'yjs'; boardId: string }

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const DB_PATH = process.env.DB_PATH ?? 'portal-space.db'
const BUILD_DIR = join(import.meta.dir, '../frontend/build')

const storage = new Storage(DB_PATH)

// Load shared YAML catalog + Tiled map at boot — both are read once, never
// hot-reloaded at runtime (types rarely change; v1 non-goal).
const configYaml = await Bun.file(join(import.meta.dir, '../shared/objects.config.yaml')).text()
const config = loadObjectConfig(configYaml)
const tiledJson = await Bun.file(join(import.meta.dir, '../frontend/static/assets/map.json')).json()

const hub = new Hub(storage, config, tiledJson)

// y.js whiteboard relay only serves the two Tiled-seeded whiteboards.
// Runtime /place-placed whiteboards have nanoid ids and are NOT wired into
// yjs yet (explicit v1 follow-up).
const yjsRelay = new YjsRelay(storage, ['tiled:wb-1', 'tiled:wb-2'])

// MIME type map for static files
const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.ico': 'image/x-icon',
}

function getMimeType(path: string): string {
	const ext = path.slice(path.lastIndexOf('.'))
	return MIME_TYPES[ext] ?? 'application/octet-stream'
}

function serveStatic(pathname: string): Response | null {
	// Map directory root to index.html
	if (pathname.endsWith('/')) pathname += 'index.html'

	const filePath = join(BUILD_DIR, pathname)

	// Bun.file doesn't throw for non-existent files — check existence first
	if (!existsSync(filePath)) return null

	// Skip directories
	try {
		const stat = Bun.file(filePath)
		if (stat.size === undefined) return null
	} catch {
		return null
	}

	return new Response(Bun.file(filePath), {
		headers: {
			'Content-Type': getMimeType(pathname),
			...(pathname.includes('/_app/immutable/')
				? { 'Cache-Control': 'public, max-age=31536000, immutable' }
				: {}),
		},
	})
}

function extractPeerToken(pathname: string): { token: string; suffix: string } | null {
	const match = pathname.match(/^\/peer\/([^/]+)(\/.*)$/)
	if (!match) return null
	return { token: match[1], suffix: match[2] }
}

const server = Bun.serve<WsData>({
	port: PORT,

	fetch(req, server) {
		const url = new URL(req.url)
		let pathname = url.pathname

		// Handle /peer/{token}/ prefix — rewrite to suffix
		const peer = extractPeerToken(pathname)
		if (peer) {
			pathname = peer.suffix || '/'
		}

		// WebSocket upgrade: game
		if (pathname === '/ws') {
			const upgraded = server.upgrade(req, { data: { type: 'game' } })
			if (upgraded) return undefined
			return new Response('WebSocket upgrade failed', { status: 400 })
		}

		// WebSocket upgrade: Y.js
		const yjsMatch = pathname.match(/^\/ws\/yjs\/(.+)$/)
		if (yjsMatch) {
			const boardId = yjsMatch[1]
			const upgraded = server.upgrade(req, { data: { type: 'yjs', boardId } })
			if (upgraded) return undefined
			return new Response('WebSocket upgrade failed', { status: 400 })
		}

		// /peer/{token} without trailing slash → redirect
		if (/^\/peer\/[^/]+$/.test(url.pathname)) {
			return Response.redirect(`${url.origin}${url.pathname}/`, 301)
		}

		// Favicon
		if (pathname === '/favicon.ico') {
			const fav = serveStatic('/favicon.svg')
			if (fav) return fav
			return new Response(null, { status: 204 })
		}

		// Try serving static file from build/
		const staticResponse = serveStatic(pathname)
		if (staticResponse) return staticResponse

		// SPA fallback — serve index.html for all unmatched routes
		const indexPath = join(BUILD_DIR, 'index.html')
		if (existsSync(indexPath)) {
			return new Response(Bun.file(indexPath), {
				headers: { 'Content-Type': 'text/html' },
			})
		}

		return new Response('Not Found — run `bun run build` first', { status: 404 })
	},

	websocket: {
		open(ws: ServerWebSocket<WsData>) {
			if (ws.data.type === 'yjs') {
				yjsRelay.handleConnection(ws, ws.data.boardId)
			}
			// Game: client registration happens in message handler after join message
		},

		message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
			if (ws.data.type === 'game') {
				const room = hub.defaultRoom()
				if (room) {
					room.handleMessage(ws, message)
				}
			} else if (ws.data.type === 'yjs') {
				if (message instanceof Buffer || message instanceof Uint8Array) {
					yjsRelay.handleMessage(ws, ws.data.boardId, new Uint8Array(message))
				}
			}
		},

		close(ws: ServerWebSocket<WsData>) {
			if (ws.data.type === 'game') {
				const room = hub.defaultRoom()
				if (room) {
					room.handleClose(ws)
				}
			} else if (ws.data.type === 'yjs') {
				yjsRelay.handleClose(ws, ws.data.boardId)
			}
		},

		idleTimeout: 60,
		maxPayloadLength: MAX_INCOMING_WS_MESSAGE_BYTES,
	},
})

console.log(`[server] portal-space running on http://localhost:${server.port}`)

// Graceful shutdown
function shutdown() {
	console.log('[server] shutting down...')
	hub.closeAll()
	storage.close()
	process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

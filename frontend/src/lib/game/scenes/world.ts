import Phaser from 'phaser'
import { get } from 'svelte/store'
import { network } from '$lib/network'
import {
	players,
	selfId,
	addChatMessage,
	addSystemMessage,
	currentStatus,
	chatInputActive,
} from '$lib/stores/game'
import { dpadDirection } from '$lib/stores/dpad'
import { notifyAudio } from '$lib/audio'
import { loadTileset } from '../tileset'
import { createAvatarSpritesheet } from '../spritesheet'
import { createTintedSpritesheet } from '../palette-swap'
import { resolveNicknameColor } from '$lib/utils/nickname-colors'
import type { PlayerInfo, Direction, InteractiveObject, RegionalChatState } from '$lib/types'
import { MAP_WIDTH, MAP_HEIGHT } from '$lib/types'
import { zoomLevel, zoomIn, zoomOut, computeMinZoom, clampZoom } from '$lib/stores/zoom'
import { interactiveObjects, nearbyObjectId } from '$lib/stores/objects'
import { whiteboardOpen, currentBoardId } from '$lib/stores/whiteboard'
import { anyModalOpen } from '$lib/stores/modal'
import {
	enterZone,
	exitZone,
	addRegionalMessage,
	regionalChatSettingsOpen,
	currentRegionalChatId,
} from '$lib/stores/regional-chat'
import {
	createInteractiveObject,
	updateNearbyState,
	destroyInteractiveObject,
	type GameInteractiveObject,
} from '../objects/interactive-object'

const MOVE_SPEED = 200 // px/sec
const NETWORK_SEND_INTERVAL = 100 // ms (10Hz)
const REMOTE_LERP_FACTOR = 0.15
const DASH_SPEED = 800 // px/sec during dash
const DASH_DURATION = 200 // ms
const DASH_COOLDOWN = 1500 // ms
const ALLOWED_CHAT_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

interface PlayerObject {
	container: Phaser.GameObjects.Container
	sprite: Phaser.GameObjects.Sprite
	nameText: Phaser.GameObjects.Text
	statusDot: Phaser.GameObjects.Graphics
	nickname: string
	x: number // pixel coordinate
	y: number // pixel coordinate
	targetX: number // remote player interpolation target
	targetY: number // remote player interpolation target
	dir: Direction
	textureKey: string
	bubbleText: Phaser.GameObjects.Text | null
	bubbleTimer: ReturnType<typeof setTimeout> | null
	emoteText: Phaser.GameObjects.Text | null
	emoteTimer: ReturnType<typeof setTimeout> | null
	customStatusBubble: Phaser.GameObjects.Text | null
}

export class WorldScene extends Phaser.Scene {
	private playerObjects: Map<string, PlayerObject> = new Map()
	private gameObjects: Map<string, GameInteractiveObject> = new Map()
	private entityContainer!: Phaser.GameObjects.Container
	private localPlayerId: string | null = null
	private tileSize = 16
	private unsubscribers: Array<() => void> = []

	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
	private wasd!: {
		up: Phaser.Input.Keyboard.Key
		down: Phaser.Input.Keyboard.Key
		left: Phaser.Input.Keyboard.Key
		right: Phaser.Input.Keyboard.Key
	}
	private collisionLayers: Phaser.Tilemaps.TilemapLayer[] = []
	private mapWidth = MAP_WIDTH
	private mapHeight = MAP_HEIGHT

	// Network send throttle
	private lastNetworkSendTime = 0
	private wasMoving = false

	// Dash state
	private isDashing = false
	private dashDir: Direction | null = null
	private modalOpen = false
	private dashStartTime = 0
	private lastDashTime = 0
	private spaceKey!: Phaser.Input.Keyboard.Key

	constructor() {
		super({ key: 'WorldScene' })
	}

	preload(): void {
		const match = location.pathname.match(/^(\/peer\/[^/]+\/)/)
		if (match) {
			this.load.setBaseURL(match[1])
		}
		loadTileset(this)
		this.load.image('gopher-src', 'assets/gopher.png')
		this.load.image('ward-stone', 'assets/ward-stone.png')
	}

	create(): void {
		createAvatarSpritesheet(this)
		this.createMap()

		this.cameras.main.setBounds(0, 0, this.mapWidth * this.tileSize, this.mapHeight * this.tileSize)

		// Declarative y-sort layer: all y-sortable entities go here
		this.entityContainer = this.add.container(0, 0)
		this.entityContainer.setDepth(10)
		this.events.on('postupdate', () => {
			this.entityContainer.sort('y')
		})

		const currentPlayers = get(players)
		const currentSelfId = get(selfId)
		this.localPlayerId = currentSelfId

		currentPlayers.forEach((info) => {
			this.addPlayer(info)
		})

		this.cursors = this.input.keyboard!.createCursorKeys()
		this.wasd = this.input.keyboard!.addKeys(
			{
				up: Phaser.Input.Keyboard.KeyCodes.W,
				down: Phaser.Input.Keyboard.KeyCodes.S,
				left: Phaser.Input.Keyboard.KeyCodes.A,
				right: Phaser.Input.Keyboard.KeyCodes.D,
			},
			false,
		) as {
			up: Phaser.Input.Keyboard.Key
			down: Phaser.Input.Keyboard.Key
			left: Phaser.Input.Keyboard.Key
			right: Phaser.Input.Keyboard.Key
		}

		this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false)

		const cursorCaptureCodes = [
			Phaser.Input.Keyboard.KeyCodes.LEFT,
			Phaser.Input.Keyboard.KeyCodes.RIGHT,
			Phaser.Input.Keyboard.KeyCodes.UP,
			Phaser.Input.Keyboard.KeyCodes.DOWN,
		]
		const unsubModal = anyModalOpen.subscribe((v) => {
			this.modalOpen = v
			if (v) {
				this.input.keyboard?.removeCapture(cursorCaptureCodes)
			} else {
				this.input.keyboard?.addCapture(cursorCaptureCodes)
			}
		})
		this.unsubscribers.push(unsubModal)

		this.setupNetwork()
		this.setupZoom()
		this.setupInteractiveObjects()

		// Render objects already in store (from initial snapshot)
		const currentObjects = get(interactiveObjects)
		currentObjects.forEach((obj, id) => {
			if (!this.gameObjects.has(id)) {
				const gameObj = createInteractiveObject(this, obj)
				this.gameObjects.set(id, gameObj)
				gameObj.container.on('pointerdown', () => {
					this.onObjectInteract(obj)
				})
			}
		})

		const unsubSelfId = selfId.subscribe((id) => {
			this.localPlayerId = id
		})
		this.unsubscribers.push(unsubSelfId)

		const unsubPlayers = players.subscribe((currentMap) => {
			currentMap.forEach((info, id) => {
				if (!this.playerObjects.has(id)) {
					this.addPlayer(info)
				}
			})
			this.playerObjects.forEach((_, id) => {
				if (!currentMap.has(id)) {
					this.removePlayer(id)
				}
			})
		})
		this.unsubscribers.push(unsubPlayers)

		this.events.on('shutdown', () => {
			this.unsubscribers.forEach((unsub) => unsub())
			this.unsubscribers = []
		})
	}

	private createMap(): void {
		const map = this.make.tilemap({ key: 'map' })
		const tileset = map.addTilesetImage('tileset', 'tileset')!

		// Read map dimensions from Tiled JSON
		this.mapWidth = map.width
		this.mapHeight = map.height

		// Ground layer (floor tiles)
		map.createLayer('ground', tileset, 0, 0)!

		// Walls layer (collides)
		const wallsLayer = map.createLayer('walls', tileset, 0, 0)!
		wallsLayer.setCollisionByProperty({ collides: true })

		// Furniture layer (tables, collides)
		const furnitureLayer = map.createLayer('furniture', tileset, 0, 0)!
		furnitureLayer.setCollisionByProperty({ collides: true })

		// Decoration layer (plants, no collision)
		map.createLayer('decoration', tileset, 0, 0)

		this.collisionLayers = [wallsLayer, furnitureLayer]
	}

	private setupZoom(): void {
		const cam = this.cameras.main
		const mapPixelW = this.mapWidth * this.tileSize
		const mapPixelH = this.mapHeight * this.tileSize

		let lastAppliedZoom = 1

		// Subscribe to zoom store — apply camera zoom on change
		const unsubZoom = zoomLevel.subscribe((level) => {
			const minZoom = computeMinZoom(cam.width, cam.height, mapPixelW, mapPixelH)
			const clamped = clampZoom(level, minZoom)

			if (clamped !== level) {
				zoomLevel.set(clamped)
				return
			}

			if (clamped !== lastAppliedZoom) {
				this.tweens.killTweensOf(cam)
				cam.setZoom(clamped)
				lastAppliedZoom = clamped
			}
		})
		this.unsubscribers.push(unsubZoom)

		// Mouse wheel zoom
		this.input.on(
			'wheel',
			(
				_pointer: Phaser.Input.Pointer,
				_gameObjects: Phaser.GameObjects.GameObject[],
				_deltaX: number,
				deltaY: number,
			) => {
				if (deltaY < 0) zoomIn()
				else if (deltaY > 0) zoomOut()
			},
		)

		// Recalculate min-zoom on viewport resize
		const onResize = (gameSize: Phaser.Structs.Size) => {
			const minZoom = computeMinZoom(gameSize.width, gameSize.height, mapPixelW, mapPixelH)
			const current = get(zoomLevel)
			const clamped = clampZoom(current, minZoom)
			if (clamped !== current) {
				zoomLevel.set(clamped)
			}
		}
		this.scale.on('resize', onResize)
		this.unsubscribers.push(() => this.scale.off('resize', onResize))
	}

	private setupNetwork(): void {
		network.on('join', (msg) => {
			if (msg.player) {
				this.addPlayer(msg.player)
				players.update((m) => {
					m.set(msg.player!.id, msg.player!)
					return m
				})
				addSystemMessage(
					msg.player.nickname + (msg.reconnect ? '님이 재접속했습니다.' : '님이 입장했습니다.'),
				)
			}
		})

		network.on('leave', (msg) => {
			if (!msg.id) return
			const obj = this.playerObjects.get(msg.id)
			const nickname = obj?.nickname ?? '알 수 없는 유저'
			this.removePlayer(msg.id)
			players.update((m) => {
				m.delete(msg.id!)
				return m
			})
			addSystemMessage(nickname + '님이 퇴장했습니다.')
		})

		network.on('move', (msg) => {
			if (msg.id && msg.id !== this.localPlayerId) {
				const p = this.playerObjects.get(msg.id)
				if (p) {
					p.targetX = msg.x
					p.targetY = msg.y
					p.dir = msg.dir ?? 'down'
					this.updateCharacterFrame(p, p.dir)
				}
				players.update((m) => {
					const info = m.get(msg.id!)
					if (info) {
						m.set(msg.id!, {
							...info,
							x: msg.x,
							y: msg.y,
							dir: msg.dir ?? 'down',
						})
					}
					return m
				})
			}
		})

		network.on('status', (msg) => {
			if (msg.id && msg.status) {
				this.updatePlayerStatus(msg.id, msg.status)
				players.update((m) => {
					const p = m.get(msg.id!)
					if (p) {
						m.set(msg.id!, { ...p, status: msg.status! })
					}
					return m
				})
			}
		})

		network.on('customStatus', (msg) => {
			if (msg.id) {
				this.updateCustomStatus(msg.id, msg.customStatus ?? '')
			}
		})

		network.on('emote', (msg) => {
			if (msg.id && msg.emoji) {
				this.showEmote(msg.id, msg.emoji)
			}
		})

		network.on('chat', (msg) => {
			const image =
				msg.image && ALLOWED_CHAT_IMAGE_MIMES.has(msg.image.mime) ? msg.image : undefined

			if (msg.id && msg.nickname && (msg.text || image)) {
				if (msg.id !== this.localPlayerId && get(currentStatus) !== 'dnd') {
					notifyAudio.playIfHidden()
				}
				// Zone enter/exit system messages
				if (msg.isSystem && msg.zoneId) {
					const text = msg.text || ''
					if (msg.zoneEvent === 'enter') {
						enterZone(msg.zoneId, msg.zoneName || '')
					} else if (msg.zoneEvent === 'exit') {
						exitZone()
					}
					// Add to regional messages
					addRegionalMessage({ text, isSystem: true })
					return
				}

				// Regional chat message
				if (msg.zoneId) {
					if (msg.id !== this.localPlayerId && get(currentStatus) !== 'dnd') {
						notifyAudio.playIfHidden()
					}
					if (msg.id && msg.nickname && (msg.text || image)) {
						const senderColors = get(players).get(msg.id)?.colors
						const bubbleText = image && msg.text ? `[사진] ${msg.text}` : (msg.text ?? '[사진]')
						this.showChatBubble(msg.id, bubbleText, msg.nickname)
						addRegionalMessage({
							senderId: msg.id,
							nickname: msg.nickname,
							nicknameColor: resolveNicknameColor(msg.id, senderColors),
							text: msg.text,
							image,
						})
					}
					return
				}

				// Global chat message (existing behavior)
				if (msg.id !== this.localPlayerId && get(currentStatus) !== 'dnd') {
					notifyAudio.playIfHidden()
				}
				if (msg.id && msg.nickname && (msg.text || image)) {
					const senderColors = get(players).get(msg.id)?.colors
					const bubbleText = image && msg.text ? `[사진] ${msg.text}` : (msg.text ?? '[사진]')
					this.showChatBubble(msg.id, bubbleText, msg.nickname)
					addChatMessage({
						senderId: msg.id,
						nickname: msg.nickname,
						nicknameColor: resolveNicknameColor(msg.id, senderColors),
						text: msg.text,
						image,
					})
				}
			}

			network.on('profile', (msg) => {
				if (!msg.id || !msg.player) return
				const p = this.playerObjects.get(msg.id)
				if (!p) return

				// Update nickname
				if (msg.nickname) {
					p.nickname = msg.nickname
					p.nameText.setText(msg.nickname)
					p.statusDot.setPosition(p.nameText.x - p.nameText.width / 2 + 8, p.nameText.y)
				}

				// Update colors — handle 'characters' -> 'player_' + id texture key transition
				if (msg.player.colors) {
					const newTextureKey = 'player_' + msg.id
					createTintedSpritesheet(this, newTextureKey, msg.player.colors)
					p.textureKey = newTextureKey
					p.sprite.setTexture(newTextureKey)
					const dirFrame: Record<Direction, number> = {
						down: 0,
						up: 1,
						right: 2,
						left: 3,
					}
					p.sprite.setFrame(dirFrame[p.dir] ?? 0)
				}

				// Update players store (for PlayerList)
				players.update((m) => {
					const info = m.get(msg.id!)
					if (info) {
						m.set(msg.id!, {
							...info,
							nickname: msg.nickname ?? info.nickname,
							colors: msg.player!.colors ?? info.colors,
						})
					}
					return m
				})
			})

			network.on('dash', (msg) => {
				if (!msg.id || msg.id === this.localPlayerId) return
				const p = this.playerObjects.get(msg.id)
				if (!p) return
				const dir = (msg.dir as Direction) ?? 'down'
				const dirFrame: Record<Direction, number> = {
					down: 0,
					up: 1,
					right: 2,
					left: 3,
				}
				this.spawnDashAfterimages(msg.x, msg.y, dir, p.textureKey, dirFrame[dir])
			})

			network.on('snapshot', (msg) => {
				this.lastNetworkSendTime = 0
				this.wasMoving = false

				const newMap = new Map<string, PlayerInfo>()
				if (msg.players) {
					msg.players.forEach((p) => {
						newMap.set(p.id, p)
					})
				}
				if (msg.self) {
					newMap.set(msg.self.id, msg.self)
					selfId.set(msg.self.id)
					this.localPlayerId = msg.self.id

					const localObj = this.playerObjects.get(msg.self.id)
					if (localObj) {
						this.cameras.main.startFollow(localObj.container, true, 0.1, 0.1)
					}
				}
				players.set(newMap)

				// Load interactive objects from snapshot
				if (msg.objects) {
					const objMap = new Map<string, InteractiveObject>()
					msg.objects.forEach((obj) => {
						objMap.set(obj.id, obj)
						if (!this.gameObjects.has(obj.id)) {
							const gameObj = createInteractiveObject(this, obj)
							this.gameObjects.set(obj.id, gameObj)
							gameObj.container.on('pointerdown', () => {
								this.onObjectInteract(obj)
							})
						}
					})
					interactiveObjects.set(objMap)
				}
			})

			network.on('action', (msg) => {
				const ap = msg.actionPayload
				if (!ap || ap.domain !== 'regional_chat' || ap.action !== 'state_updated') return
				if (!ap.objectId) return

				const gObj = this.gameObjects.get(ap.objectId)
				if (!gObj || gObj.data.type !== 'regional_chat') return

				const newState = ap.payload as RegionalChatState | undefined
				if (!newState) return

				// Update stored data
				gObj.data = { ...gObj.data, state: newState }

				// Redraw zone fill circle
				if (gObj.zoneCircle) {
					gObj.zoneCircle.clear()
					gObj.zoneCircle.fillStyle(0x06b6d4, 0.08)
					gObj.zoneCircle.fillCircle(0, 0, newState.radius)
				}

				// Redraw stroke circle (keep current alpha for tween)
				if (gObj.zoneStroke) {
					const currentAlpha = gObj.zoneStroke.alpha
					gObj.zoneStroke.clear()
					gObj.zoneStroke.lineStyle(2, 0x06b6d4, 0.3)
					gObj.zoneStroke.strokeCircle(0, 0, newState.radius)
					gObj.zoneStroke.setAlpha(currentAlpha)
				}

				// Update label text
				if (gObj.zoneLabel) {
					gObj.zoneLabel.setText(newState.name)
				}

				// Update interactiveObjects store
				interactiveObjects.update((m) => {
					m.set(ap.objectId!, gObj.data)
					return m
				})
			})
		})
	}

	private addPlayer(info: PlayerInfo): void {
		if (this.playerObjects.has(info.id)) return

		// Server now sends pixel coordinates directly
		const px = info.x
		const py = info.y

		// Create per-player tinted texture or use default
		const textureKey = info.colors ? 'player_' + info.id : 'characters'
		if (info.colors) {
			createTintedSpritesheet(this, textureKey, info.colors)
		}

		const dirFrame: Record<Direction, number> = {
			down: 0,
			up: 1,
			right: 2,
			left: 3,
		}
		const frameIndex = dirFrame[info.dir] ?? 0

		// All positions are relative to the character container
		const sprite = this.add.sprite(0, 0, textureKey, frameIndex)

		const nameText = this.add
			.text(0, -this.tileSize / 2 - 14, info.nickname, {
				fontSize: '12px',
				color: '#e0e0ff',
				fontFamily: 'MulmaruMono',
				backgroundColor: 'rgba(0, 0, 0, 0.5)',
				padding: { left: 14, right: 4, top: 2, bottom: 2 },
			})
			.setOrigin(0.5)
			.setResolution(1)

		const statusDot = this.add.graphics()
		const dotColor = Phaser.Display.Color.HexStringToColor(this.getStatusColor(info.status)).color
		statusDot.fillStyle(dotColor, 1)
		statusDot.fillCircle(0, 0, 3)
		statusDot.setPosition(-nameText.width / 2 + 8, -this.tileSize / 2 - 14)

		// Container groups character elements; entityContainer auto-sorts by y
		const container = this.add.container(px, py, [sprite, nameText, statusDot])
		this.entityContainer.add(container)

		this.playerObjects.set(info.id, {
			container,
			sprite,
			nameText,
			statusDot,
			nickname: info.nickname,
			x: px,
			y: py,
			targetX: px,
			targetY: py,
			dir: info.dir ?? 'down',
			textureKey,
			bubbleText: null,
			bubbleTimer: null,
			emoteText: null,
			emoteTimer: null,
			customStatusBubble: null,
		})

		if (info.customStatus) {
			this.updateCustomStatus(info.id, info.customStatus)
		}

		if (info.id === this.localPlayerId) {
			this.cameras.main.startFollow(container, true, 0.1, 0.1)
		}
	}

	private removePlayer(id: string): void {
		const p = this.playerObjects.get(id)
		if (!p) return
		p.container.destroy() // destroys sprite, nameText, statusDot together
		if (p.bubbleText) {
			this.tweens.killTweensOf(p.bubbleText)
			p.bubbleText.destroy()
		}
		if (p.bubbleTimer) clearTimeout(p.bubbleTimer)
		if (p.emoteText) {
			this.tweens.killTweensOf(p.emoteText)
			p.emoteText.destroy()
		}
		if (p.emoteTimer) clearTimeout(p.emoteTimer)
		if (p.customStatusBubble) p.customStatusBubble.destroy()

		// Clean up per-player texture to prevent memory leak
		const playerTexKey = 'player_' + id
		if (this.textures.exists(playerTexKey)) {
			this.textures.remove(playerTexKey)
		}

		this.playerObjects.delete(id)
	}

	private isTileBlocked(tileX: number, tileY: number): boolean {
		if (tileX < 0 || tileX >= this.mapWidth || tileY < 0 || tileY >= this.mapHeight) return true
		return this.collisionLayers.some((layer) => {
			const tile = layer.getTileAt(tileX, tileY)
			return tile !== null && tile.properties?.collides === true
		})
	}

	private checkCollision(
		p: PlayerObject,
		newPx: number,
		newPy: number,
		dir: Direction,
	): { x: number; y: number } {
		const ts = this.tileSize
		const curTileX = Math.floor(p.x / ts)
		const curTileY = Math.floor(p.y / ts)

		if (dir === 'right') {
			const newTileX = Math.floor(newPx / ts)
			const checkTileY = Math.round((p.y - ts / 2) / ts)
			if (newTileX !== curTileX && this.isTileBlocked(newTileX, checkTileY)) {
				newPx = newTileX * ts - 0.5
			}
		} else if (dir === 'left') {
			const newTileX = Math.floor(newPx / ts)
			const checkTileY = Math.round((p.y - ts / 2) / ts)
			if (newTileX !== curTileX && this.isTileBlocked(newTileX, checkTileY)) {
				newPx = (newTileX + 1) * ts + 0.5
			}
		} else if (dir === 'down') {
			const newTileY = Math.floor(newPy / ts)
			const checkTileX = Math.round((p.x - ts / 2) / ts)
			if (newTileY !== curTileY && this.isTileBlocked(checkTileX, newTileY)) {
				newPy = newTileY * ts - 0.5
			}
		} else if (dir === 'up') {
			const newTileY = Math.floor(newPy / ts)
			const checkTileX = Math.round((p.x - ts / 2) / ts)
			if (newTileY !== curTileY && this.isTileBlocked(checkTileX, newTileY)) {
				newPy = (newTileY + 1) * ts + 0.5
			}
		}

		return { x: newPx, y: newPy }
	}

	private updatePlayerVisuals(p: PlayerObject): void {
		p.container.setPosition(p.x, p.y)
		// Sub-elements use relative coords within the container — no individual updates needed
		// StatusDot tracks nameText width (fixed after creation, but kept for safety)
		p.statusDot.setPosition(-p.nameText.width / 2 + 8, -this.tileSize / 2 - 14)
		// UI elements remain on the main display list with absolute positions
		if (p.customStatusBubble) {
			p.customStatusBubble.setPosition(p.x, p.y - this.tileSize / 2 - 34)
		}
		if (p.bubbleText) {
			p.bubbleText.setPosition(p.x, p.y - this.tileSize - 10)
		}
		if (p.emoteText) {
			p.emoteText.setPosition(p.x, p.y - this.tileSize - 34)
		}
	}

	/** Add a game object to the y-sorted entity layer. */
	addToSortLayer(obj: Phaser.GameObjects.GameObject): void {
		this.entityContainer.add(obj)
	}

	/** Remove a game object from the y-sorted entity layer. */
	removeFromSortLayer(obj: Phaser.GameObjects.GameObject): void {
		this.entityContainer.remove(obj)
	}

	private updateCharacterFrame(p: PlayerObject, dir: Direction): void {
		const dirFrame: Record<Direction, number> = {
			down: 0,
			up: 1,
			right: 2,
			left: 3,
		}
		p.sprite.setFrame(dirFrame[dir] ?? 0)
	}

	private updatePlayerStatus(id: string, status: string): void {
		const p = this.playerObjects.get(id)
		if (!p) return
		const dotColor = Phaser.Display.Color.HexStringToColor(this.getStatusColor(status)).color
		p.statusDot.clear()
		p.statusDot.fillStyle(dotColor, 1)
		p.statusDot.fillCircle(0, 0, 3)
	}

	private getStatusColor(status: string): string {
		const colors: Record<string, string> = {
			online: '#4ade80',
			away: '#eab308',
			dnd: '#ef4444',
		}
		return colors[status] ?? '#4ade80'
	}

	private updateCustomStatus(id: string, text: string): void {
		const p = this.playerObjects.get(id)
		if (!p) return

		if (p.customStatusBubble) {
			p.customStatusBubble.destroy()
			p.customStatusBubble = null
		}

		if (!text) return

		p.customStatusBubble = this.add
			.text(p.x, p.y - this.tileSize / 2 - 34, text, {
				fontSize: '12px',
				color: '#ffffff',
				fontFamily: 'MulmaruMono',
				backgroundColor: '#445588cc',
				padding: { x: 6, y: 3 },
				stroke: '#000',
				strokeThickness: 1,
			})
			.setOrigin(0.5)
			.setDepth(15)
			.setResolution(2)
	}

	private showChatBubble(id: string, text: string, _nickname: string): void {
		const p = this.playerObjects.get(id)
		if (!p) return

		if (p.bubbleText) {
			this.tweens.killTweensOf(p.bubbleText)
			p.bubbleText.destroy()
			if (p.bubbleTimer) clearTimeout(p.bubbleTimer)
		}

		const px = p.x
		const py = p.y - this.tileSize - 10

		const displayText = text.length > 40 ? text.substring(0, 40) + '...' : text

		p.bubbleText = this.add
			.text(px, py, displayText, {
				fontSize: '12px',
				color: '#ffffff',
				fontFamily: 'MulmaruMono',
				backgroundColor: '#333355dd',
				padding: { x: 6, y: 4 },
				stroke: '#000',
				strokeThickness: 1,
				wordWrap: { width: 200 },
			})
			.setOrigin(0.5)
			.setDepth(100)
			.setResolution(2)

		p.bubbleTimer = setTimeout(() => {
			if (p.bubbleText) {
				this.tweens.add({
					targets: p.bubbleText,
					alpha: 0,
					duration: 500,
					onComplete: () => {
						if (p.bubbleText) {
							p.bubbleText.destroy()
							p.bubbleText = null
						}
					},
				})
			}
		}, 3000)
	}

	private showEmote(id: string, emoji: string): void {
		const p = this.playerObjects.get(id)
		if (!p) return

		if (p.emoteText) {
			this.tweens.killTweensOf(p.emoteText)
			p.emoteText.destroy()
			if (p.emoteTimer) clearTimeout(p.emoteTimer)
		}

		const px = p.x
		const py = p.y - this.tileSize - 34

		p.emoteText = this.add
			.text(px, py, emoji, {
				fontSize: '20px',
				fontFamily: 'MulmaruMono',
				stroke: '#000',
				strokeThickness: 2,
			})
			.setOrigin(0.5)
			.setDepth(101)
			.setResolution(2)

		this.tweens.add({
			targets: p.emoteText,
			y: '-=8',
			duration: 600,
			ease: 'Power1',
		})

		p.emoteTimer = setTimeout(() => {
			if (p.emoteText) {
				this.tweens.add({
					targets: p.emoteText,
					alpha: 0,
					duration: 500,
					onComplete: () => {
						if (p.emoteText) {
							p.emoteText.destroy()
							p.emoteText = null
						}
					},
				})
			}
		}, 3000)
	}

	private spawnDashAfterimages(
		_x: number,
		_y: number,
		dir: Direction,
		textureKey: string,
		frame: number,
	): void {
		const count = 6
		const delayPerGhost = DASH_DURATION / count

		for (let i = 0; i < count; i++) {
			this.time.delayedCall(delayPerGhost * (i + 1), () => {
				const localPlayer = this.playerObjects.get(this.localPlayerId)
				if (!localPlayer) return

				const ghost = this.add.sprite(localPlayer.x, localPlayer.y, textureKey, frame)
				ghost.setDepth(9)
				ghost.setTintFill(0xffffff)
				ghost.setAlpha(0.7 - i * 0.1)

				this.tweens.add({
					targets: ghost,
					alpha: 0,
					duration: 250,
					ease: 'Power2',
					onComplete: () => ghost.destroy(),
				})
			})
		}
	}

	update(_time: number, delta: number): void {
		if (!this.localPlayerId) return

		// Interpolate remote players
		this.playerObjects.forEach((p, id) => {
			if (id === this.localPlayerId) return
			const dx = p.targetX - p.x
			const dy = p.targetY - p.y
			if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
				const clampedDelta = Math.min(delta, 50)
				const t = Math.min(1, 1 - Math.pow(1 - REMOTE_LERP_FACTOR, clampedDelta / 16.67))
				p.x += dx * t
				p.y += dy * t
				this.updatePlayerVisuals(p)
			} else if (dx !== 0 || dy !== 0) {
				p.x = p.targetX
				p.y = p.targetY
				this.updatePlayerVisuals(p)
			}
		})

		// Local player movement
		const localPlayer = this.playerObjects.get(this.localPlayerId)
		if (!localPlayer) return

		// Block all input (including mobile dpad) when any modal is open
		if (this.modalOpen) {
			if (this.isDashing) {
				this.isDashing = false
				this.dashDir = null
			}
			return
		}

		const dpad = get(dpadDirection)
		const activeEl = document.activeElement
		const isTyping =
			activeEl?.tagName === 'INPUT' ||
			activeEl?.tagName === 'TEXTAREA' ||
			(activeEl as HTMLElement)?.isContentEditable
		if ((get(chatInputActive) || isTyping) && !dpad) return

		let dx = 0,
			dy = 0
		let dir: Direction | null = null

		// 축별 독립 합산 — 반대 방향 상쇄
		if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1
		if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1
		if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1
		if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1

		// 방향 결정 (4방향만, X축 우선)
		if (dx !== 0) {
			dir = dx > 0 ? 'right' : 'left'
		} else if (dy !== 0) {
			dir = dy > 0 ? 'down' : 'up'
		}

		if (!dir && dpad) {
			dir = dpad
		}

		const isMovingNow = dir !== null
		const now = performance.now()

		// Dash trigger: spacebar while moving, respecting cooldown
		if (
			dir &&
			!this.isDashing &&
			Phaser.Input.Keyboard.JustDown(this.spaceKey) &&
			now - this.lastDashTime >= DASH_COOLDOWN
		) {
			this.isDashing = true
			this.dashDir = dir
			this.dashStartTime = now
			this.lastDashTime = now
			network.sendDash(dir)

			const dirFrame: Record<Direction, number> = {
				down: 0,
				up: 1,
				right: 2,
				left: 3,
			}
			this.spawnDashAfterimages(
				localPlayer.x,
				localPlayer.y,
				dir,
				localPlayer.textureKey,
				dirFrame[dir],
			)
		}

		// End dash if duration expired
		if (this.isDashing && now - this.dashStartTime >= DASH_DURATION) {
			this.isDashing = false
			this.dashDir = null
		}

		// Determine effective direction and speed
		const effectiveDir = this.isDashing ? this.dashDir! : dir
		const effectiveSpeed = this.isDashing ? DASH_SPEED : MOVE_SPEED

		if (effectiveDir) {
			const eDx = effectiveDir === 'right' ? 1 : effectiveDir === 'left' ? -1 : 0
			const eDy = effectiveDir === 'down' ? 1 : effectiveDir === 'up' ? -1 : 0
			const moveAmount = effectiveSpeed * (delta / 1000)
			let newX = localPlayer.x + eDx * moveAmount
			let newY = localPlayer.y + eDy * moveAmount

			const result = this.checkCollision(localPlayer, newX, newY, effectiveDir)
			newX = result.x
			newY = result.y

			// If collision stopped movement during dash, end dash early
			if (this.isDashing) {
				const movedX = Math.abs(newX - localPlayer.x)
				const movedY = Math.abs(newY - localPlayer.y)
				if (movedX < 0.1 && movedY < 0.1) {
					this.isDashing = false
					this.dashDir = null
				}
			}

			localPlayer.x = newX
			localPlayer.y = newY
			localPlayer.dir = effectiveDir

			this.updateCharacterFrame(localPlayer, effectiveDir)
			this.updatePlayerVisuals(localPlayer)

			// Throttled network send
			if (now - this.lastNetworkSendTime >= NETWORK_SEND_INTERVAL) {
				this.lastNetworkSendTime = now
				network.sendMove(newX, newY, effectiveDir)

				players.update((m) => {
					const info = m.get(this.localPlayerId!)
					if (info) {
						m.set(this.localPlayerId!, {
							...info,
							x: newX,
							y: newY,
							dir: effectiveDir,
						})
					}
					return m
				})
			}
		} else if (!isMovingNow && !this.isDashing && this.wasMoving) {
			// Movement ended — send final position immediately
			network.sendMove(localPlayer.x, localPlayer.y, localPlayer.dir)

			players.update((m) => {
				const info = m.get(this.localPlayerId!)
				if (info) {
					m.set(this.localPlayerId!, {
						...info,
						x: localPlayer.x,
						y: localPlayer.y,
						dir: localPlayer.dir,
					})
				}
				return m
			})
		}

		this.wasMoving = isMovingNow || this.isDashing

		// Update nearby interactive objects
		this.updateNearbyObjects()
	}

	private setupInteractiveObjects(): void {
		const eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E, false)
		eKey.on('down', () => {
			const activeEl = document.activeElement
			const isTyping =
				activeEl?.tagName === 'INPUT' ||
				activeEl?.tagName === 'TEXTAREA' ||
				(activeEl as HTMLElement)?.isContentEditable
			if (this.modalOpen || get(chatInputActive) || isTyping) return

			const nearId = get(nearbyObjectId)
			if (nearId) {
				const gObj = this.gameObjects.get(nearId)
				if (gObj) this.onObjectInteract(gObj.data)
			}
		})

		const unsubObjects = interactiveObjects.subscribe((objMap) => {
			this.gameObjects.forEach((gObj, id) => {
				if (!objMap.has(id)) {
					destroyInteractiveObject(gObj)
					this.gameObjects.delete(id)
				}
			})
		})
		this.unsubscribers.push(unsubObjects)
	}

	private onObjectInteract(obj: InteractiveObject): void {
		if (obj.type === 'whiteboard') {
			currentBoardId.set(obj.id)
			whiteboardOpen.set(true)
		} else if (obj.type === 'regional_chat') {
			currentRegionalChatId.set(obj.id)
			regionalChatSettingsOpen.set(true)
		}
	}

	private updateNearbyObjects(): void {
		if (!this.localPlayerId) return
		const localPlayer = this.playerObjects.get(this.localPlayerId)
		if (!localPlayer) return

		let closestId: string | null = null
		let closestDist = Infinity

		this.gameObjects.forEach((gObj, id) => {
			const isNear = updateNearbyState(gObj, localPlayer.x, localPlayer.y)
			if (isNear) {
				const dx = gObj.data.x - localPlayer.x
				const dy = gObj.data.y - localPlayer.y
				const dist = Math.sqrt(dx * dx + dy * dy)
				if (dist < closestDist) {
					closestDist = dist
					closestId = id
				}
			}
		})

		nearbyObjectId.set(closestId)
	}
}

import Phaser from 'phaser'
import type { InteractiveObject, RegionalChatState } from '@shared/types'
import type { ObjectTypeDef } from '@shared/config'

const TILE_SIZE = 16

export interface GameInteractiveObject {
	data: InteractiveObject
	typeDef: ObjectTypeDef
	container: Phaser.GameObjects.Container
	highlight: Phaser.GameObjects.Graphics
	label: Phaser.GameObjects.DOMElement
	isNearby: boolean
	// regional_chat extras
	wardStoneSprite?: Phaser.GameObjects.Image
	zoneCircle?: Phaser.GameObjects.Graphics
	zoneStroke?: Phaser.GameObjects.Graphics
	zoneLabel?: Phaser.GameObjects.DOMElement
}

export function createInteractiveObject(
	scene: Phaser.Scene,
	obj: InteractiveObject,
	typeDef: ObjectTypeDef,
): GameInteractiveObject {
	const container = scene.add.container(obj.x, obj.y)
	container.setDepth(5)

	// Visual — sprite source comes from typeDef.sprite. For the two v1 types
	// the sprite path selects between an image asset (ward-stone) and a
	// procedural Graphics whiteboard.
	let wardStoneSprite: Phaser.GameObjects.Image | undefined
	if (typeDef.sprite.startsWith('image/')) {
		const key = typeDef.sprite.slice('image/'.length)
		wardStoneSprite = scene.add.image(0, 0, key).setOrigin(0.5, 1)
		container.add(wardStoneSprite)
	} else {
		const sprite = scene.add.graphics()
		// Whiteboard — dark rectangle with border and inner white area
		sprite.fillStyle(0x2a2a3e, 1)
		sprite.fillRect(-TILE_SIZE, -TILE_SIZE * 2, TILE_SIZE * 2, TILE_SIZE * 3)
		sprite.lineStyle(2, 0x06b6d4, 1)
		sprite.strokeRect(-TILE_SIZE, -TILE_SIZE * 2, TILE_SIZE * 2, TILE_SIZE * 3)
		sprite.fillStyle(0xffffff, 0.9)
		sprite.fillRect(-TILE_SIZE + 4, -TILE_SIZE * 2 + 4, TILE_SIZE * 2 - 8, TILE_SIZE * 3 - 8)
		container.add(sprite)
	}

	// regional_chat zone visuals — triggered by object state + circle hit shape
	let zoneCircle: Phaser.GameObjects.Graphics | undefined
	let zoneStroke: Phaser.GameObjects.Graphics | undefined
	let zoneLabel: Phaser.GameObjects.DOMElement | undefined

	if (obj.type === 'regional_chat') {
		const state = obj.state as RegionalChatState | undefined
		const radius = state?.radius ?? 128
		const name = state?.name ?? ''

		zoneCircle = scene.add.graphics()
		zoneCircle.fillStyle(0x06b6d4, 0.08)
		zoneCircle.fillCircle(0, 0, radius)
		container.add(zoneCircle)

		zoneStroke = scene.add.graphics()
		zoneStroke.lineStyle(2, 0x06b6d4, 0.3)
		zoneStroke.strokeCircle(0, 0, radius)
		container.add(zoneStroke)

		scene.tweens.add({
			targets: zoneStroke,
			alpha: { from: 0.2, to: 0.4 },
			duration: 1500,
			yoyo: true,
			loop: -1,
			ease: 'Sine.easeInOut',
		})

		const zoneLabelEl = document.createElement('div')
		zoneLabelEl.className = 'phaser-zone-label'
		zoneLabelEl.textContent = name // XSS-safe

		zoneLabel = scene.add.dom(0, -56, zoneLabelEl).setOrigin(0.5).setDepth(6).setAlpha(0.85)
		zoneLabel.pointerEvents = 'none'
		container.add(zoneLabel)
	}

	// Highlight graphic — rect types get a stroked outline. Circle types rely
	// on a preFX glow applied to the sprite in updateNearbyState (pixel-
	// perfect for ward-stone alpha mask).
	const highlight = scene.add.graphics()
	if (typeDef.hitShape === 'rect') {
		highlight.lineStyle(2, 0xfbbf24, 0.8)
		const r = typeDef.hitRect ?? {
			x: -TILE_SIZE,
			y: -TILE_SIZE * 2,
			w: TILE_SIZE * 2,
			h: TILE_SIZE * 3,
		}
		highlight.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4)
	}
	highlight.setVisible(false)
	container.add(highlight)

	// Interaction label — always uses typeDef.interactionRadius proximity
	const labelY = typeDef.hitShape === 'circle' ? 24 : TILE_SIZE * 1.5 + 8
	const labelEl = document.createElement('div')
	labelEl.className = 'phaser-object-label'
	labelEl.textContent = '[E] 사용'

	const label = scene.add.dom(0, labelY, labelEl).setOrigin(0.5).setDepth(6).setVisible(false)
	label.pointerEvents = 'none'
	container.add(label)

	// Hit area driven by typeDef.hitShape
	if (typeDef.hitShape === 'circle') {
		const r = typeDef.hitCircle?.radius ?? typeDef.interactionRadius
		const hitArea = new Phaser.Geom.Circle(0, 0, r)
		container.setInteractive({
			hitArea,
			hitAreaCallback: Phaser.Geom.Circle.Contains,
			useHandCursor: true,
		})
	} else {
		const r = typeDef.hitRect ?? {
			x: -TILE_SIZE,
			y: -TILE_SIZE * 2,
			w: TILE_SIZE * 2,
			h: TILE_SIZE * 3,
		}
		const hitArea = new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h)
		container.setInteractive({
			hitArea,
			hitAreaCallback: Phaser.Geom.Rectangle.Contains,
			useHandCursor: true,
		})
	}

	return {
		data: obj,
		typeDef,
		container,
		highlight,
		label,
		isNearby: false,
		wardStoneSprite,
		zoneCircle,
		zoneStroke,
		zoneLabel,
	}
}

export function updateNearbyState(
	obj: GameInteractiveObject,
	playerX: number,
	playerY: number,
): boolean {
	const dx = obj.data.x - playerX
	const dy = obj.data.y - playerY
	const dist = Math.sqrt(dx * dx + dy * dy)
	const radius = 1.5 * TILE_SIZE
	const wasNearby = obj.isNearby
	obj.isNearby = dist <= radius

	if (obj.isNearby !== wasNearby) {
		obj.label.setVisible(obj.isNearby)

		// Accepted residual type-branch: circle-hit-shape (regional_chat) uses
		// a WebGL preFX glow on the sprite itself for pixel-perfect outlines.
		// Other shapes use the stroked Graphics highlight.
		if (obj.wardStoneSprite && obj.typeDef.hitShape === 'circle') {
			if (obj.isNearby) {
				obj.wardStoneSprite.preFX?.addGlow(0xffffff, 3, 0, false, 0.15, 6)
			} else {
				obj.wardStoneSprite.preFX?.clear()
			}
		} else {
			obj.highlight.setVisible(obj.isNearby)
		}
	}

	return obj.isNearby
}

export function destroyInteractiveObject(obj: GameInteractiveObject): void {
	obj.container.destroy()
}

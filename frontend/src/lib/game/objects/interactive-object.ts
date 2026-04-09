import Phaser from 'phaser';
import type { InteractiveObject, RegionalChatState } from '$lib/types';

const INTERACTION_RADIUS = 1.5 * 32; // 1.5 tiles in pixels
const TILE_SIZE = 32;

export interface GameInteractiveObject {
  data: InteractiveObject;
  container: Phaser.GameObjects.Container;
  highlight: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  isNearby: boolean;
  // regional_chat extras
  wardStoneSprite?: Phaser.GameObjects.Image;
  zoneCircle?: Phaser.GameObjects.Graphics;
  zoneStroke?: Phaser.GameObjects.Graphics;
  zoneLabel?: Phaser.GameObjects.Text;
}

export function createInteractiveObject(
  scene: Phaser.Scene,
  obj: InteractiveObject
): GameInteractiveObject {
  const container = scene.add.container(obj.x, obj.y);
  container.setDepth(5);

  // Visual representation based on type
  let wardStoneSprite: Phaser.GameObjects.Image | undefined;
  if (obj.type === 'regional_chat') {
    wardStoneSprite = scene.add.image(0, 0, 'ward-stone').setOrigin(0.5, 1);
    container.add(wardStoneSprite);
  } else {
    const sprite = scene.add.graphics();
    if (obj.type === 'whiteboard') {
      // Whiteboard: dark rectangle with border
      sprite.fillStyle(0x2a2a3e, 1);
      sprite.fillRect(-TILE_SIZE, -TILE_SIZE * 1.5, TILE_SIZE * 2, TILE_SIZE * 3);
      sprite.lineStyle(2, 0x06b6d4, 1);
      sprite.strokeRect(-TILE_SIZE, -TILE_SIZE * 1.5, TILE_SIZE * 2, TILE_SIZE * 3);
      // Inner white area
      sprite.fillStyle(0xffffff, 0.9);
      sprite.fillRect(-TILE_SIZE + 4, -TILE_SIZE * 1.5 + 4, TILE_SIZE * 2 - 8, TILE_SIZE * 3 - 8);
    }
    container.add(sprite);
  }

  // regional_chat: translucent circle zone
  let zoneCircle: Phaser.GameObjects.Graphics | undefined;
  let zoneStroke: Phaser.GameObjects.Graphics | undefined;
  let zoneLabel: Phaser.GameObjects.Text | undefined;

  if (obj.type === 'regional_chat') {
    const state = obj.state as RegionalChatState | undefined;
    const radius = state?.radius ?? 128;
    const name = state?.name ?? '';

    // Fill layer (below stroke so stroke pulse is on top)
    zoneCircle = scene.add.graphics();
    zoneCircle.fillStyle(0x06b6d4, 0.08);
    zoneCircle.fillCircle(0, 0, radius);
    container.add(zoneCircle);

    // Stroke layer — animated
    zoneStroke = scene.add.graphics();
    zoneStroke.lineStyle(2, 0x06b6d4, 0.3);
    zoneStroke.strokeCircle(0, 0, radius);
    container.add(zoneStroke);

    // Pulse tween on the stroke alpha
    scene.tweens.add({
      targets: zoneStroke,
      alpha: { from: 0.2, to: 0.4 },
      duration: 1500,
      yoyo: true,
      loop: -1,
      ease: 'Sine.easeInOut'
    });

    // Zone name label at center
    zoneLabel = scene.add
      .text(0, -56, name, {
        fontSize: '12px',
        color: '#67e8f9',
        fontFamily: 'MulmaruMono',
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { x: 6, y: 3 }
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setAlpha(0.85);
    container.add(zoneLabel);
  }

  // Highlight effect (shown when nearby)
  const highlight = scene.add.graphics();
  if (obj.type === 'whiteboard') {
    highlight.lineStyle(2, 0xfbbf24, 0.8);
    highlight.strokeRect(-TILE_SIZE - 2, -TILE_SIZE * 1.5 - 2, TILE_SIZE * 2 + 4, TILE_SIZE * 3 + 4);
  }
  // regional_chat uses preFX glow on the sprite instead of Graphics highlight
  highlight.setVisible(false);
  container.add(highlight);

  // Interaction label — always uses INTERACTION_RADIUS proximity, not zone radius
  const labelY = obj.type === 'regional_chat' ? 24 : TILE_SIZE * 1.5 + 8;
  const label = scene.add
    .text(0, labelY, '[E] 사용', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'MulmaruMono',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 4, y: 2 }
    })
    .setOrigin(0.5)
    .setDepth(6)
    .setVisible(false);
  container.add(label);

  // Make interactive with pointer cursor
  if (obj.type === 'regional_chat') {
    const hitArea = new Phaser.Geom.Circle(0, 0, INTERACTION_RADIUS);
    container.setInteractive({ hitArea, hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
  } else {
    const hitArea = new Phaser.Geom.Rectangle(
      -TILE_SIZE,
      -TILE_SIZE * 1.5,
      TILE_SIZE * 2,
      TILE_SIZE * 3
    );
    container.setInteractive({ hitArea, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
  }

  return {
    data: obj,
    container,
    highlight,
    label,
    isNearby: false,
    wardStoneSprite,
    zoneCircle,
    zoneStroke,
    zoneLabel
  };
}

export function updateNearbyState(
  obj: GameInteractiveObject,
  playerX: number,
  playerY: number
): boolean {
  const dx = obj.data.x - playerX;
  const dy = obj.data.y - playerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const wasNearby = obj.isNearby;
  obj.isNearby = dist <= INTERACTION_RADIUS;

  if (obj.isNearby !== wasNearby) {
    obj.label.setVisible(obj.isNearby);

    if (obj.wardStoneSprite) {
      // Pixel-perfect outline glow via WebGL PostFX
      if (obj.isNearby) {
        obj.wardStoneSprite.preFX?.addGlow(0xffffff, 3, 0, false, 0.15, 6);
      } else {
        obj.wardStoneSprite.preFX?.clear();
      }
    } else {
      obj.highlight.setVisible(obj.isNearby);
    }
  }

  return obj.isNearby;
}

export function destroyInteractiveObject(obj: GameInteractiveObject): void {
  obj.container.destroy();
}

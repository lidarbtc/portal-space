import Phaser from 'phaser';
import type { InteractiveObject } from '$lib/types';

const INTERACTION_RADIUS = 1.5 * 32; // 1.5 tiles in pixels
const TILE_SIZE = 32;

export interface GameInteractiveObject {
  data: InteractiveObject;
  container: Phaser.GameObjects.Container;
  highlight: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  isNearby: boolean;
}

export function createInteractiveObject(
  scene: Phaser.Scene,
  obj: InteractiveObject
): GameInteractiveObject {
  const container = scene.add.container(obj.x, obj.y);
  container.setDepth(5);

  // Visual representation based on type
  const sprite = scene.add.graphics();
  if (obj.type === 'whiteboard') {
    // Whiteboard: dark rectangle with border
    sprite.fillStyle(0x2a2a3e, 1);
    sprite.fillRect(-TILE_SIZE, -TILE_SIZE * 1.5, TILE_SIZE * 2, TILE_SIZE * 3);
    sprite.lineStyle(2, 0x6366f1, 1);
    sprite.strokeRect(-TILE_SIZE, -TILE_SIZE * 1.5, TILE_SIZE * 2, TILE_SIZE * 3);
    // Inner white area
    sprite.fillStyle(0xffffff, 0.9);
    sprite.fillRect(-TILE_SIZE + 4, -TILE_SIZE * 1.5 + 4, TILE_SIZE * 2 - 8, TILE_SIZE * 3 - 8);
  }
  container.add(sprite);

  // Highlight effect (shown when nearby)
  const highlight = scene.add.graphics();
  highlight.lineStyle(2, 0xfbbf24, 0.8);
  highlight.strokeRect(-TILE_SIZE - 2, -TILE_SIZE * 1.5 - 2, TILE_SIZE * 2 + 4, TILE_SIZE * 3 + 4);
  highlight.setVisible(false);
  container.add(highlight);

  // Interaction label
  const label = scene.add
    .text(0, TILE_SIZE * 1.5 + 8, '[E] 사용', {
      fontSize: '12px',
      color: '#fbbf24',
      fontFamily: 'MulmaruMono',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 4, y: 2 }
    })
    .setOrigin(0.5)
    .setDepth(6)
    .setVisible(false);
  container.add(label);

  // Make interactive
  const hitArea = new Phaser.Geom.Rectangle(
    -TILE_SIZE,
    -TILE_SIZE * 1.5,
    TILE_SIZE * 2,
    TILE_SIZE * 3
  );
  container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

  return {
    data: obj,
    container,
    highlight,
    label,
    isNearby: false
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
    obj.highlight.setVisible(obj.isNearby);
    obj.label.setVisible(obj.isNearby);
  }

  return obj.isNearby;
}

export function destroyInteractiveObject(obj: GameInteractiveObject): void {
  obj.container.destroy();
}

import Phaser from 'phaser';
import { get } from 'svelte/store';
import { network } from '$lib/network';
import {
  players,
  selfId,
  addChatMessage,
  addSystemMessage,
  currentStatus,
  chatInputActive
} from '$lib/stores/game';
import { notifyAudio } from '$lib/audio';
import { createPlaceholderTileset } from '../tileset';
import { createAvatarSpritesheet } from '../spritesheet';
import type { PlayerInfo, Direction } from '$lib/types';
import { MAP_WIDTH, MAP_HEIGHT } from '$lib/types';

interface PlayerObject {
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  nickname: string;
  gridX: number;
  gridY: number;
  dir: Direction;
  avatar: number;
  bubbleText: Phaser.GameObjects.Text | null;
  bubbleTimer: ReturnType<typeof setTimeout> | null;
  emoteText: Phaser.GameObjects.Text | null;
  emoteTimer: ReturnType<typeof setTimeout> | null;
}

export class WorldScene extends Phaser.Scene {
  private playerObjects: Map<string, PlayerObject> = new Map();
  private localPlayerId: string | null = null;
  private tileSize = 32;
  private isMoving = false;
  private unsubscribers: Array<() => void> = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private mapLayer!: Phaser.Tilemaps.TilemapLayer;
  private mapData!: number[][];

  constructor() {
    super({ key: 'WorldScene' });
  }

  preload(): void {
    createPlaceholderTileset(this);

    // Load original gopher sprite for avatar 0, relay-aware base URL
    const match = location.pathname.match(/^(\/peer\/[^/]+\/)/);
    if (match) {
      this.load.setBaseURL(match[1]);
    }
    this.load.image('gopher-src', 'assets/gopher.png');
  }

  create(): void {
    // Build combined spritesheet: gopher (row 0) + canvas avatars (rows 1-3)
    createAvatarSpritesheet(this);

    // Create tilemap from data
    this.createMap();

    // Setup players from store
    const currentPlayers = get(players);
    const currentSelfId = get(selfId);
    this.localPlayerId = currentSelfId;

    currentPlayers.forEach((info) => {
      this.addPlayer(info);
    });

    // Setup keyboard
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as {
      up: Phaser.Input.Keyboard.Key;
      down: Phaser.Input.Keyboard.Key;
      left: Phaser.Input.Keyboard.Key;
      right: Phaser.Input.Keyboard.Key;
    };

    // Setup network handlers
    this.setupNetwork();

    // Subscribe to selfId store to track local player
    const unsubSelfId = selfId.subscribe((id) => {
      this.localPlayerId = id;
    });
    this.unsubscribers.push(unsubSelfId);

    // Subscribe to players store to sync additions/removals
    const unsubPlayers = players.subscribe((currentMap) => {
      // Add any players not yet in scene
      currentMap.forEach((info, id) => {
        if (!this.playerObjects.has(id)) {
          this.addPlayer(info);
        }
      });
      // Remove any players no longer in store
      this.playerObjects.forEach((_, id) => {
        if (!currentMap.has(id)) {
          this.removePlayer(id);
        }
      });
    });
    this.unsubscribers.push(unsubPlayers);

    // Cleanup on scene shutdown
    this.events.on('shutdown', () => {
      this.unsubscribers.forEach((unsub) => unsub());
      this.unsubscribers = [];
    });
  }

  private createMap(): void {
    const mapData = this.generateMapData();

    const map = this.make.tilemap({
      data: mapData,
      tileWidth: this.tileSize,
      tileHeight: this.tileSize
    });

    const tileset = map.addTilesetImage('tileset', 'tileset', this.tileSize, this.tileSize)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollision([1, 2]); // walls and tables block movement

    this.mapLayer = layer;
    this.mapData = mapData;
  }

  private generateMapData(): number[][] {
    const data: number[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (y === 0 || y === MAP_HEIGHT - 1 || x === 0 || x === MAP_WIDTH - 1) {
          row.push(1); // Wall
        } else {
          row.push(0); // Floor
        }
      }
      data.push(row);
    }

    // Tables (matching server collision map in hub.go)
    const tables: [number, number][] = [
      [4, 4], [5, 4], [4, 7], [5, 7], [4, 10], [5, 10],
      [10, 4], [11, 4], [10, 7], [11, 7], [10, 10], [11, 10],
      [16, 4], [17, 4], [16, 7], [17, 7], [16, 10], [17, 10]
    ];
    tables.forEach(([x, y]) => { data[y][x] = 2; });

    return data;
  }

  private setupNetwork(): void {
    network.on('join', (msg) => {
      if (msg.player) {
        this.addPlayer(msg.player);
        players.update((m) => {
          m.set(msg.player!.id, msg.player!);
          return m;
        });
        addSystemMessage(msg.player.nickname + '님이 입장했습니다.');
      }
    });

    network.on('leave', (msg) => {
      if (!msg.id) return;
      const obj = this.playerObjects.get(msg.id);
      const nickname = obj?.nickname ?? '알 수 없는 유저';
      this.removePlayer(msg.id);
      players.update((m) => {
        m.delete(msg.id!);
        return m;
      });
      addSystemMessage(nickname + '님이 퇴장했습니다.');
    });

    network.on('move', (msg) => {
      if (msg.id && msg.id !== this.localPlayerId) {
        this.movePlayerTo(msg.id, msg.x ?? 0, msg.y ?? 0, msg.dir ?? 'down');
        players.update((m) => {
          const p = m.get(msg.id!);
          if (p) {
            m.set(msg.id!, { ...p, x: msg.x ?? 0, y: msg.y ?? 0, dir: msg.dir ?? 'down' });
          }
          return m;
        });
      }
    });

    network.on('status', (msg) => {
      if (msg.id && msg.status) {
        this.updatePlayerStatus(msg.id, msg.status);
        players.update((m) => {
          const p = m.get(msg.id!);
          if (p) {
            m.set(msg.id!, { ...p, status: msg.status! });
          }
          return m;
        });
      }
    });

    network.on('emote', (msg) => {
      if (msg.id && msg.emoji) {
        this.showEmote(msg.id, msg.emoji);
      }
    });

    network.on('chat', (msg) => {
      if (msg.id !== this.localPlayerId) {
        notifyAudio.playIfHidden();
      }
      if (msg.id && msg.nickname && msg.text) {
        this.showChatBubble(msg.id, msg.text, msg.nickname);
        addChatMessage(msg.nickname, msg.text);
      }
    });

    network.on('snapshot', (msg) => {
      if (msg.players) {
        msg.players.forEach((p) => {
          if (!this.playerObjects.has(p.id)) {
            this.addPlayer(p);
          }
          players.update((m) => {
            m.set(p.id, p);
            return m;
          });
        });
      }
    });

    network.on('disconnect', () => {
      this.add
        .text(
          this.cameras.main.centerX,
          this.cameras.main.centerY,
          '연결이 끊어졌습니다',
          { fontSize: '24px', color: '#ff6b6b', fontFamily: 'MulmaruMono' }
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1000)
        .setResolution(2);
    });
  }

  private addPlayer(info: PlayerInfo): void {
    if (this.playerObjects.has(info.id)) return;

    const px = info.x * this.tileSize + this.tileSize / 2;
    const py = info.y * this.tileSize + this.tileSize / 2;

    // Frame index: avatar * 4 + direction (down=0, up=1, right=2, left=3)
    const dirFrame: Record<Direction, number> = { down: 0, up: 1, right: 2, left: 3 };
    const avatarIndex = info.avatar ?? 0;
    const frameIndex = avatarIndex * 4 + (dirFrame[info.dir] ?? 0);

    const sprite = this.add.sprite(px, py, 'characters', frameIndex);
    sprite.setDepth(10);

    const nameText = this.add
      .text(px, py - this.tileSize / 2 - 14, info.nickname, {
        fontSize: '12px',
        color: '#e0e0ff',
        fontFamily: 'MulmaruMono',
        stroke: '#000',
        strokeThickness: 2
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setResolution(2);

    const statusLabel = this.getStatusLabel(info.status);
    const statusText = this.add
      .text(px, py - this.tileSize / 2 - 24, statusLabel, {
        fontSize: '14px',
        fontFamily: 'Arial',
        padding: { x: 2, y: 2 }
      })
      .setOrigin(0.5, 1)
      .setDepth(11);

    this.playerObjects.set(info.id, {
      sprite,
      nameText,
      statusText,
      nickname: info.nickname,
      gridX: info.x,
      gridY: info.y,
      dir: info.dir ?? 'down',
      avatar: avatarIndex,
      bubbleText: null,
      bubbleTimer: null,
      emoteText: null,
      emoteTimer: null
    });
  }

  private removePlayer(id: string): void {
    const p = this.playerObjects.get(id);
    if (!p) return;
    p.sprite.destroy();
    p.nameText.destroy();
    p.statusText.destroy();
    if (p.bubbleText) p.bubbleText.destroy();
    if (p.bubbleTimer) clearTimeout(p.bubbleTimer);
    if (p.emoteText) p.emoteText.destroy();
    if (p.emoteTimer) clearTimeout(p.emoteTimer);
    this.playerObjects.delete(id);
  }

  private movePlayerTo(id: string, x: number, y: number, dir: Direction): void {
    const p = this.playerObjects.get(id);
    if (!p) return;

    p.gridX = x;
    p.gridY = y;
    p.dir = dir;

    const px = x * this.tileSize + this.tileSize / 2;
    const py = y * this.tileSize + this.tileSize / 2;

    this.tweens.add({
      targets: [p.sprite],
      x: px,
      y: py,
      duration: 150,
      ease: 'Linear'
    });

    this.tweens.add({
      targets: [p.nameText],
      x: px,
      y: py - this.tileSize / 2 - 14,
      duration: 150
    });

    this.tweens.add({
      targets: [p.statusText],
      x: px,
      y: py - this.tileSize / 2 - 24,
      duration: 150
    });

    if (p.bubbleText) {
      this.tweens.add({
        targets: [p.bubbleText],
        x: px,
        y: py - this.tileSize - 10,
        duration: 150
      });
    }

    if (p.emoteText) {
      this.tweens.add({
        targets: [p.emoteText],
        x: px,
        y: py - this.tileSize - 34,
        duration: 150
      });
    }

    this.updateCharacterFrame(p, dir);
  }

  private updateCharacterFrame(p: PlayerObject, dir: Direction): void {
    const dirFrame: Record<Direction, number> = { down: 0, up: 1, right: 2, left: 3 };
    p.sprite.setFrame((p.avatar ?? 0) * 4 + (dirFrame[dir] ?? 0));
  }

  private updatePlayerStatus(id: string, status: string): void {
    const p = this.playerObjects.get(id);
    if (!p) return;
    p.statusText.setText(this.getStatusLabel(status));
  }

  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = { coding: '💻', resting: '☕', away: '🚶' };
    return labels[status] ?? '💻';
  }

  private showChatBubble(id: string, text: string, _nickname: string): void {
    const p = this.playerObjects.get(id);
    if (!p) return;

    if (p.bubbleText) {
      p.bubbleText.destroy();
      if (p.bubbleTimer) clearTimeout(p.bubbleTimer);
    }

    const px = p.sprite.x;
    const py = p.sprite.y - this.tileSize - 10;

    // Truncate long messages for display
    const displayText = text.length > 40 ? text.substring(0, 40) + '...' : text;

    p.bubbleText = this.add
      .text(px, py, displayText, {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'MulmaruMono',
        backgroundColor: '#333355dd',
        padding: { x: 6, y: 4 },
        stroke: '#000',
        strokeThickness: 1,
        wordWrap: { width: 200 }
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setResolution(2);

    // Fade out after 3 seconds
    p.bubbleTimer = setTimeout(() => {
      if (p.bubbleText) {
        this.tweens.add({
          targets: p.bubbleText,
          alpha: 0,
          duration: 500,
          onComplete: () => {
            if (p.bubbleText) {
              p.bubbleText.destroy();
              p.bubbleText = null;
            }
          }
        });
      }
    }, 3000);
  }

  private showEmote(id: string, emoji: string): void {
    const p = this.playerObjects.get(id);
    if (!p) return;

    if (p.emoteText) {
      p.emoteText.destroy();
      if (p.emoteTimer) clearTimeout(p.emoteTimer);
    }

    const px = p.sprite.x;
    const py = p.sprite.y - this.tileSize - 34;

    p.emoteText = this.add
      .text(px, py, emoji, {
        fontSize: '20px',
        fontFamily: 'MulmaruMono',
        stroke: '#000',
        strokeThickness: 2
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setResolution(2);

    // Float up animation (relative delta so it works during movement)
    this.tweens.add({
      targets: p.emoteText,
      y: '-=8',
      duration: 600,
      ease: 'Power1'
    });

    // Fade out after 3 seconds
    p.emoteTimer = setTimeout(() => {
      if (p.emoteText) {
        this.tweens.add({
          targets: p.emoteText,
          alpha: 0,
          duration: 500,
          onComplete: () => {
            if (p.emoteText) {
              p.emoteText.destroy();
              p.emoteText = null;
            }
          }
        });
      }
    }, 3000);
  }

  update(_time: number, _delta: number): void {
    if (!this.localPlayerId || !this.playerObjects.has(this.localPlayerId)) return;
    if (get(chatInputActive)) return;
    if (this.isMoving) return;

    let dx = 0, dy = 0;
    let dir: Direction | null = null;

    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      dx = -1; dir = 'left';
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      dx = 1; dir = 'right';
    } else if (this.cursors.up.isDown || this.wasd.up.isDown) {
      dy = -1; dir = 'up';
    } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
      dy = 1; dir = 'down';
    }

    if (dir) {
      const p = this.playerObjects.get(this.localPlayerId)!;
      const newX = p.gridX + dx;
      const newY = p.gridY + dy;

      // Client-side collision check
      if (newX >= 0 && newX < MAP_WIDTH && newY >= 0 && newY < MAP_HEIGHT) {
        const tile = this.mapData[newY][newX];
        if (tile !== 1 && tile !== 2) { // Not wall or table
          this.isMoving = true;
          p.gridX = newX;
          p.gridY = newY;
          p.dir = dir;

          const px = newX * this.tileSize + this.tileSize / 2;
          const py = newY * this.tileSize + this.tileSize / 2;

          network.sendMove(newX, newY, dir);
          this.updateCharacterFrame(p, dir);

          this.tweens.add({
            targets: [p.sprite],
            x: px,
            y: py,
            duration: 150,
            ease: 'Linear',
            onComplete: () => { this.isMoving = false; }
          });

          this.tweens.add({
            targets: [p.nameText],
            x: px,
            y: py - this.tileSize / 2 - 14,
            duration: 150
          });

          this.tweens.add({
            targets: [p.statusText],
            x: px,
            y: py - this.tileSize / 2 - 24,
            duration: 150
          });

          if (p.bubbleText) {
            this.tweens.add({
              targets: [p.bubbleText],
              x: px,
              y: py - this.tileSize - 10,
              duration: 150
            });
          }

          if (p.emoteText) {
            this.tweens.add({
              targets: [p.emoteText],
              x: px,
              y: py - this.tileSize - 34,
              duration: 150
            });
          }

          // Sync position back to store
          players.update((m) => {
            const info = m.get(this.localPlayerId!);
            if (info) {
              m.set(this.localPlayerId!, { ...info, x: newX, y: newY, dir });
            }
            return m;
          });
        } else {
          // Blocked — just update facing direction
          this.updateCharacterFrame(p, dir);
        }
      }
    }
  }
}

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
import { dpadDirection } from '$lib/stores/dpad';
import { notifyAudio } from '$lib/audio';
import { createPlaceholderTileset } from '../tileset';
import { createAvatarSpritesheet } from '../spritesheet';
import type { PlayerInfo, Direction } from '$lib/types';
import { MAP_WIDTH, MAP_HEIGHT } from '$lib/types';

const MOVE_SPEED = 200; // px/sec
const NETWORK_SEND_INTERVAL = 100; // ms (10Hz)
const REMOTE_LERP_FACTOR = 0.15;

interface PlayerObject {
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  nickname: string;
  x: number;       // pixel coordinate
  y: number;       // pixel coordinate
  targetX: number;  // remote player interpolation target
  targetY: number;  // remote player interpolation target
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

  // Network send throttle
  private lastNetworkSendTime = 0;
  private wasMoving = false;

  constructor() {
    super({ key: 'WorldScene' });
  }

  preload(): void {
    createPlaceholderTileset(this);

    const match = location.pathname.match(/^(\/peer\/[^/]+\/)/);
    if (match) {
      this.load.setBaseURL(match[1]);
    }
    this.load.image('gopher-src', 'assets/gopher.png');
  }

  create(): void {
    createAvatarSpritesheet(this);
    this.createMap();

    this.cameras.main.setBounds(0, 0, MAP_WIDTH * this.tileSize, MAP_HEIGHT * this.tileSize);

    const currentPlayers = get(players);
    const currentSelfId = get(selfId);
    this.localPlayerId = currentSelfId;

    currentPlayers.forEach((info) => {
      this.addPlayer(info);
    });

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

    this.setupNetwork();

    const unsubSelfId = selfId.subscribe((id) => {
      this.localPlayerId = id;
    });
    this.unsubscribers.push(unsubSelfId);

    const unsubPlayers = players.subscribe((currentMap) => {
      currentMap.forEach((info, id) => {
        if (!this.playerObjects.has(id)) {
          this.addPlayer(info);
        }
      });
      this.playerObjects.forEach((_, id) => {
        if (!currentMap.has(id)) {
          this.removePlayer(id);
        }
      });
    });
    this.unsubscribers.push(unsubPlayers);

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
    layer.setCollision([1, 2]);

    this.mapLayer = layer;
    this.mapData = mapData;
  }

  private generateMapData(): number[][] {
    const data: number[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (y === 0 || y === MAP_HEIGHT - 1 || x === 0 || x === MAP_WIDTH - 1) {
          row.push(1);
        } else {
          row.push(0);
        }
      }
      data.push(row);
    }

    const baseTables: [number, number][] = [
      [4, 4], [5, 4], [4, 7], [5, 7], [4, 10], [5, 10],
      [10, 4], [11, 4], [10, 7], [11, 7], [10, 10], [11, 10],
      [16, 4], [17, 4], [16, 7], [17, 7], [16, 10], [17, 10]
    ];
    for (let blockY = 0; blockY < Math.floor(MAP_HEIGHT / 15); blockY++) {
      for (let blockX = 0; blockX < Math.floor(MAP_WIDTH / 20); blockX++) {
        baseTables.forEach(([bx, by]) => {
          const x = bx + blockX * 20;
          const y = by + blockY * 15;
          if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
            data[y][x] = 2;
          }
        });
      }
    }

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
        addSystemMessage(msg.player.nickname + (msg.reconnect ? '님이 재접속했습니다.' : '님이 입장했습니다.'));
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
        const p = this.playerObjects.get(msg.id);
        if (p) {
          p.targetX = msg.x;
          p.targetY = msg.y;
          p.dir = msg.dir ?? 'down';
          this.updateCharacterFrame(p, p.dir);
        }
        players.update((m) => {
          const info = m.get(msg.id!);
          if (info) {
            m.set(msg.id!, { ...info, x: msg.x, y: msg.y, dir: msg.dir ?? 'down' });
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
      if (msg.id !== this.localPlayerId && get(currentStatus) !== 'dnd') {
        notifyAudio.playIfHidden();
      }
      if (msg.id && msg.nickname && msg.text) {
        this.showChatBubble(msg.id, msg.text, msg.nickname);
        addChatMessage(msg.nickname, msg.text);
      }
    });

    network.on('snapshot', (msg) => {
      this.lastNetworkSendTime = 0;
      this.wasMoving = false;

      const newMap = new Map<string, PlayerInfo>();
      if (msg.players) {
        msg.players.forEach((p) => {
          newMap.set(p.id, p);
        });
      }
      if (msg.self) {
        newMap.set(msg.self.id, msg.self);
        selfId.set(msg.self.id);
        this.localPlayerId = msg.self.id;

        const localObj = this.playerObjects.get(msg.self.id);
        if (localObj) {
          this.cameras.main.startFollow(localObj.sprite, true, 0.1, 0.1);
        }
      }
      players.set(newMap);
    });
  }

  private addPlayer(info: PlayerInfo): void {
    if (this.playerObjects.has(info.id)) return;

    // Server now sends pixel coordinates directly
    const px = info.x;
    const py = info.y;

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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: { x: 4, y: 2 }
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
      x: px,
      y: py,
      targetX: px,
      targetY: py,
      dir: info.dir ?? 'down',
      avatar: avatarIndex,
      bubbleText: null,
      bubbleTimer: null,
      emoteText: null,
      emoteTimer: null
    });

    if (info.id === this.localPlayerId) {
      this.cameras.main.startFollow(sprite, true, 0.1, 0.1);
    }
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

  private isTileBlocked(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return true;
    const tile = this.mapData[tileY][tileX];
    return tile === 1 || tile === 2;
  }

  private checkCollision(
    p: PlayerObject, newPx: number, newPy: number, dir: Direction
  ): { x: number; y: number } {
    const ts = this.tileSize;
    const curTileX = Math.floor(p.x / ts);
    const curTileY = Math.floor(p.y / ts);

    if (dir === 'right') {
      const newTileX = Math.floor(newPx / ts);
      const checkTileY = Math.round((p.y - ts / 2) / ts);
      if (newTileX !== curTileX && this.isTileBlocked(newTileX, checkTileY)) {
        newPx = newTileX * ts - 0.5;
      }
    } else if (dir === 'left') {
      const newTileX = Math.floor(newPx / ts);
      const checkTileY = Math.round((p.y - ts / 2) / ts);
      if (newTileX !== curTileX && this.isTileBlocked(newTileX, checkTileY)) {
        newPx = (newTileX + 1) * ts + 0.5;
      }
    } else if (dir === 'down') {
      const newTileY = Math.floor(newPy / ts);
      const checkTileX = Math.round((p.x - ts / 2) / ts);
      if (newTileY !== curTileY && this.isTileBlocked(checkTileX, newTileY)) {
        newPy = newTileY * ts - 0.5;
      }
    } else if (dir === 'up') {
      const newTileY = Math.floor(newPy / ts);
      const checkTileX = Math.round((p.x - ts / 2) / ts);
      if (newTileY !== curTileY && this.isTileBlocked(checkTileX, newTileY)) {
        newPy = (newTileY + 1) * ts + 0.5;
      }
    }

    return { x: newPx, y: newPy };
  }

  private updatePlayerVisuals(p: PlayerObject): void {
    p.sprite.setPosition(p.x, p.y);
    p.nameText.setPosition(p.x, p.y - this.tileSize / 2 - 14);
    p.statusText.setPosition(p.x, p.y - this.tileSize / 2 - 24);
    if (p.bubbleText) {
      p.bubbleText.setPosition(p.x, p.y - this.tileSize - 10);
    }
    if (p.emoteText) {
      p.emoteText.setPosition(p.x, p.y - this.tileSize - 34);
    }
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
    const labels: Record<string, string> = { coding: '💻', resting: '☕', away: '🚶', dnd: '🚫' };
    return labels[status] ?? '💻';
  }

  private showChatBubble(id: string, text: string, _nickname: string): void {
    const p = this.playerObjects.get(id);
    if (!p) return;

    if (p.bubbleText) {
      p.bubbleText.destroy();
      if (p.bubbleTimer) clearTimeout(p.bubbleTimer);
    }

    const px = p.x;
    const py = p.y - this.tileSize - 10;

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

    const px = p.x;
    const py = p.y - this.tileSize - 34;

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

    this.tweens.add({
      targets: p.emoteText,
      y: '-=8',
      duration: 600,
      ease: 'Power1'
    });

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

  update(_time: number, delta: number): void {
    if (!this.localPlayerId) return;

    // Interpolate remote players
    this.playerObjects.forEach((p, id) => {
      if (id === this.localPlayerId) return;
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        const clampedDelta = Math.min(delta, 50);
        const t = Math.min(1, 1 - Math.pow(1 - REMOTE_LERP_FACTOR, clampedDelta / 16.67));
        p.x += dx * t;
        p.y += dy * t;
        this.updatePlayerVisuals(p);
      } else if (dx !== 0 || dy !== 0) {
        p.x = p.targetX;
        p.y = p.targetY;
        this.updatePlayerVisuals(p);
      }
    });

    // Local player movement
    const localPlayer = this.playerObjects.get(this.localPlayerId);
    if (!localPlayer) return;

    const dpad = get(dpadDirection);
    if (get(chatInputActive) && !dpad) return;

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

    if (!dir && dpad) {
      dir = dpad;
      dx = dpad === 'left' ? -1 : dpad === 'right' ? 1 : 0;
      dy = dpad === 'up' ? -1 : dpad === 'down' ? 1 : 0;
    }

    const isMovingNow = dir !== null;

    if (dir) {
      const moveAmount = MOVE_SPEED * (delta / 1000);
      let newX = localPlayer.x + dx * moveAmount;
      let newY = localPlayer.y + dy * moveAmount;

      const result = this.checkCollision(localPlayer, newX, newY, dir);
      newX = result.x;
      newY = result.y;

      localPlayer.x = newX;
      localPlayer.y = newY;
      localPlayer.dir = dir;

      this.updateCharacterFrame(localPlayer, dir);
      this.updatePlayerVisuals(localPlayer);

      // Throttled network send
      const now = performance.now();
      if (now - this.lastNetworkSendTime >= NETWORK_SEND_INTERVAL) {
        this.lastNetworkSendTime = now;
        network.sendMove(newX, newY, dir);

        players.update((m) => {
          const info = m.get(this.localPlayerId!);
          if (info) {
            m.set(this.localPlayerId!, { ...info, x: newX, y: newY, dir });
          }
          return m;
        });
      }
    } else if (!isMovingNow && this.wasMoving) {
      // Movement ended — send final position immediately
      network.sendMove(localPlayer.x, localPlayer.y, localPlayer.dir);

      players.update((m) => {
        const info = m.get(this.localPlayerId!);
        if (info) {
          m.set(this.localPlayerId!, { ...info, x: localPlayer.x, y: localPlayer.y, dir: localPlayer.dir });
        }
        return m;
      });
    }

    this.wasMoving = isMovingNow;
  }
}

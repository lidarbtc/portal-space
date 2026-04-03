class WorldScene extends Phaser.Scene {
    constructor() {
        super({ key: 'WorldScene' });
        this.players = {};      // id -> { sprite, nameText, statusText, bubbleText, bubbleTimer }
        this.localPlayerId = null;
        this.tileSize = 32;
        this.isMoving = false;
        this.moveQueue = [];
    }

    init(data) {
        this.nickname = data.nickname;
        this.initialPlayers = data.players || [];
        this.selfInfo = data.self || null;
    }

    preload() {
        // Generate placeholder tileset as a canvas texture
        this.createPlaceholderTileset();
        this.createPlaceholderCharacters();
    }

    createPlaceholderTileset() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        // Tile 0: Floor (light tan)
        ctx.fillStyle = '#c4a882';
        ctx.fillRect(0, 0, 32, 32);
        // Add subtle grid lines
        ctx.strokeStyle = '#b89b75';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, 31, 31);

        // Tile 1: Wall (dark brown)
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(32, 0, 32, 32);
        ctx.strokeStyle = '#3a2a1e';
        ctx.lineWidth = 1;
        ctx.strokeRect(32.5, 0.5, 31, 31);
        // Brick pattern
        ctx.strokeStyle = '#5a4738';
        ctx.beginPath();
        ctx.moveTo(32, 16); ctx.lineTo(64, 16);
        ctx.moveTo(48, 0); ctx.lineTo(48, 16);
        ctx.moveTo(40, 16); ctx.lineTo(40, 32);
        ctx.moveTo(56, 16); ctx.lineTo(56, 32);
        ctx.stroke();

        // Tile 2: Table (gray)
        ctx.fillStyle = '#8b7355';
        ctx.fillRect(64, 0, 32, 32);
        ctx.fillStyle = '#7a6248';
        ctx.fillRect(66, 2, 28, 28);
        // Monitor on table
        ctx.fillStyle = '#334455';
        ctx.fillRect(72, 6, 16, 12);
        ctx.fillStyle = '#66aadd';
        ctx.fillRect(74, 8, 12, 8);

        // Tile 3: Plant (green accent)
        ctx.fillStyle = '#c4a882';
        ctx.fillRect(96, 0, 32, 32);
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(108, 20, 8, 12);
        ctx.fillStyle = '#2d8a4e';
        ctx.beginPath();
        ctx.arc(112, 16, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3aaf5c';
        ctx.beginPath();
        ctx.arc(110, 14, 6, 0, Math.PI * 2);
        ctx.fill();

        this.textures.addCanvas('tileset', canvas);
    }

    createPlaceholderCharacters() {
        const canvas = document.createElement('canvas');
        // 4 directions × 2 frames = 8 frames, each 32x32
        canvas.width = 64;  // 2 frames
        canvas.height = 128; // 4 directions
        const ctx = canvas.getContext('2d');

        const colors = { body: '#5588cc', head: '#ffccaa', hair: '#553322' };
        const directions = ['down', 'left', 'right', 'up'];

        directions.forEach((dir, row) => {
            for (let frame = 0; frame < 2; frame++) {
                const x = frame * 32;
                const y = row * 32;
                const offsetX = frame === 1 ? 1 : -1;

                // Body
                ctx.fillStyle = colors.body;
                ctx.fillRect(x + 10, y + 16, 12, 12);

                // Head
                ctx.fillStyle = colors.head;
                ctx.fillRect(x + 11, y + 6, 10, 10);

                // Hair
                ctx.fillStyle = colors.hair;
                ctx.fillRect(x + 11, y + 4, 10, 4);

                // Eyes (direction-aware)
                ctx.fillStyle = '#222';
                if (dir === 'down') {
                    ctx.fillRect(x + 13, y + 10, 2, 2);
                    ctx.fillRect(x + 17, y + 10, 2, 2);
                } else if (dir === 'up') {
                    // No eyes visible from back
                } else if (dir === 'left') {
                    ctx.fillRect(x + 12, y + 10, 2, 2);
                } else {
                    ctx.fillRect(x + 18, y + 10, 2, 2);
                }

                // Legs with walk animation
                ctx.fillStyle = '#334466';
                if (frame === 0) {
                    ctx.fillRect(x + 12, y + 28, 4, 4);
                    ctx.fillRect(x + 16, y + 28, 4, 4);
                } else {
                    ctx.fillRect(x + 11 + offsetX, y + 28, 4, 4);
                    ctx.fillRect(x + 17 - offsetX, y + 28, 4, 4);
                }
            }
        });

        // Add as spritesheet with proper frame data
        const texture = this.textures.addCanvas('characters', canvas);
        const frameWidth = 32;
        const frameHeight = 32;
        const cols = canvas.width / frameWidth;
        const rows = canvas.height / frameHeight;
        let frameIndex = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                texture.add(frameIndex, 0, col * frameWidth, row * frameHeight, frameWidth, frameHeight);
                frameIndex++;
            }
        }
    }

    create() {
        // Create tilemap from data
        this.createMap();

        // Create local player from snapshot self info
        if (this.selfInfo) {
            this.localPlayerId = this.selfInfo.id;
            this.addPlayer(this.selfInfo);
        }

        // Create existing players from snapshot
        this.initialPlayers.forEach(p => {
            this.addPlayer(p);
        });

        // Setup keyboard
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        // Setup network handlers
        this.setupNetwork();

        // Initialize UI
        UI.init();
        UI.updatePlayerCount(Object.keys(this.players).length);

        UI.onStatusChange = (status) => {
            Network.sendStatus(status);
            if (this.localPlayerId && this.players[this.localPlayerId]) {
                this.updatePlayerStatus(this.localPlayerId, status);
            }
        };

        UI.onChatSend = (text) => {
            if (this.localPlayerId && this.players[this.localPlayerId]) {
                const p = this.players[this.localPlayerId];
                Network.sendChat(text, p.gridX, p.gridY);
            }
        };
    }

    createMap() {
        // Map data: 0=floor, 1=wall, 2=table, 3=plant
        const mapData = this.generateMapData();

        // Create tilemap
        const map = this.make.tilemap({
            data: mapData,
            tileWidth: this.tileSize,
            tileHeight: this.tileSize
        });

        const tileset = map.addTilesetImage('tileset', 'tileset', this.tileSize, this.tileSize);
        const layer = map.createLayer(0, tileset, 0, 0);
        layer.setCollision([1, 2]); // walls and tables block movement

        this.mapLayer = layer;
        this.mapData = mapData;
    }

    generateMapData() {
        const data = [];
        for (let y = 0; y < mapHeight; y++) {
            const row = [];
            for (let x = 0; x < mapWidth; x++) {
                if (y === 0 || y === mapHeight - 1 || x === 0 || x === mapWidth - 1) {
                    row.push(1); // Wall
                } else {
                    row.push(0); // Floor
                }
            }
            data.push(row);
        }

        // Tables (matching server collision map)
        const tables = [
            [4,4],[5,4],[4,7],[5,7],[4,10],[5,10],
            [10,4],[11,4],[10,7],[11,7],[10,10],[11,10],
            [16,4],[17,4],[16,7],[17,7],[16,10],[17,10]
        ];
        tables.forEach(([x, y]) => { data[y][x] = 2; });

        // Plants for decoration
        const plants = [[2,2],[18,2],[2,12],[18,12],[9,1],[14,1]];
        plants.forEach(([x, y]) => {
            if (data[y][x] === 1) return; // don't overwrite walls
            data[y][x] = 3;
        });

        return data;
    }

    setupNetwork() {
        Network.on('join', (msg) => {
            if (msg.player) {
                this.addPlayer(msg.player);
                if (msg.player.nickname === this.nickname && !this.localPlayerId) {
                    this.localPlayerId = msg.player.id;
                }
                UI.updatePlayerCount(Object.keys(this.players).length);
            }
        });

        Network.on('leave', (msg) => {
            this.removePlayer(msg.id);
            UI.updatePlayerCount(Object.keys(this.players).length);
        });

        Network.on('move', (msg) => {
            if (msg.id !== this.localPlayerId) {
                this.movePlayerTo(msg.id, msg.x, msg.y, msg.dir);
            }
        });

        Network.on('status', (msg) => {
            this.updatePlayerStatus(msg.id, msg.status);
        });

        Network.on('chat', (msg) => {
            this.showChatBubble(msg.id, msg.text, msg.nickname);
        });

        Network.on('snapshot', (msg) => {
            // Re-sync if needed
            if (msg.players) {
                msg.players.forEach(p => {
                    if (!this.players[p.id]) {
                        this.addPlayer(p);
                    }
                });
                UI.updatePlayerCount(Object.keys(this.players).length);
            }
        });

        Network.on('disconnect', () => {
            // Show disconnect message
            const text = this.add.text(
                this.cameras.main.centerX,
                this.cameras.main.centerY,
                '연결이 끊어졌습니다',
                { fontSize: '20px', color: '#ff6b6b', fontFamily: 'Courier New' }
            ).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
        });
    }

    addPlayer(info) {
        if (this.players[info.id]) return;

        const px = info.x * this.tileSize + this.tileSize / 2;
        const py = info.y * this.tileSize + this.tileSize / 2;

        // Frame index: row * 2 + col (2 cols per row, 4 rows for directions)
        const dirRow = { down: 0, left: 1, right: 2, up: 3 };
        const row = dirRow[info.dir] || 0;
        const frameIndex = row * 2; // idle frame

        const sprite = this.add.sprite(px, py, 'characters', frameIndex);
        sprite.setDepth(10);

        // Name text
        const nameText = this.add.text(px, py - this.tileSize / 2 - 14, info.nickname, {
            fontSize: '11px',
            color: '#e0e0ff',
            fontFamily: 'Courier New',
            stroke: '#000',
            strokeThickness: 2
        }).setOrigin(0.5).setDepth(11);

        // Status text
        const statusLabel = this.getStatusLabel(info.status);
        const statusText = this.add.text(px, py - this.tileSize / 2 - 2, statusLabel, {
            fontSize: '10px',
            color: '#aaddaa',
            fontFamily: 'Courier New',
            stroke: '#000',
            strokeThickness: 2
        }).setOrigin(0.5).setDepth(11);

        this.players[info.id] = {
            sprite, nameText, statusText,
            gridX: info.x, gridY: info.y,
            dir: info.dir || 'down',
            bubbleText: null, bubbleTimer: null
        };
    }

    removePlayer(id) {
        const p = this.players[id];
        if (!p) return;
        p.sprite.destroy();
        p.nameText.destroy();
        p.statusText.destroy();
        if (p.bubbleText) p.bubbleText.destroy();
        if (p.bubbleTimer) clearTimeout(p.bubbleTimer);
        delete this.players[id];
    }

    movePlayerTo(id, x, y, dir) {
        const p = this.players[id];
        if (!p) return;

        p.gridX = x;
        p.gridY = y;
        p.dir = dir;

        const px = x * this.tileSize + this.tileSize / 2;
        const py = y * this.tileSize + this.tileSize / 2;

        // Tween to new position
        this.tweens.add({
            targets: [p.sprite],
            x: px, y: py,
            duration: 150,
            ease: 'Linear'
        });

        // Update name/status positions
        this.tweens.add({
            targets: [p.nameText],
            x: px, y: py - this.tileSize / 2 - 14,
            duration: 150
        });
        this.tweens.add({
            targets: [p.statusText],
            x: px, y: py - this.tileSize / 2 - 2,
            duration: 150
        });

        if (p.bubbleText) {
            this.tweens.add({
                targets: [p.bubbleText],
                x: px, y: py - this.tileSize - 10,
                duration: 150
            });
        }

        // Update character direction
        this.updateCharacterFrame(p, dir);
    }

    updateCharacterFrame(p, dir) {
        const dirRow = { down: 0, left: 1, right: 2, up: 3 };
        const row = dirRow[dir] || 0;
        p.sprite.setFrame(row * 2); // idle frame for direction
    }

    updatePlayerStatus(id, status) {
        const p = this.players[id];
        if (!p) return;
        p.statusText.setText(this.getStatusLabel(status));
    }

    getStatusLabel(status) {
        const labels = { coding: '💻', resting: '☕', away: '🚶' };
        return labels[status] || '💻';
    }

    showChatBubble(id, text, nickname) {
        const p = this.players[id];
        if (!p) return;

        // Remove existing bubble
        if (p.bubbleText) {
            p.bubbleText.destroy();
            clearTimeout(p.bubbleTimer);
        }

        const px = p.sprite.x;
        const py = p.sprite.y - this.tileSize - 10;

        // Truncate long messages for display
        const displayText = text.length > 40 ? text.substring(0, 40) + '...' : text;

        p.bubbleText = this.add.text(px, py, displayText, {
            fontSize: '10px',
            color: '#ffffff',
            fontFamily: 'Courier New',
            backgroundColor: '#333355dd',
            padding: { x: 6, y: 4 },
            stroke: '#000',
            strokeThickness: 1,
            wordWrap: { width: 200 }
        }).setOrigin(0.5).setDepth(100);

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

    update(time, delta) {
        if (!this.localPlayerId || !this.players[this.localPlayerId]) return;
        if (UI.isChatActive()) return;
        if (this.isMoving) return;

        let dx = 0, dy = 0, dir = null;

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
            const p = this.players[this.localPlayerId];
            const newX = p.gridX + dx;
            const newY = p.gridY + dy;

            // Client-side collision check
            if (newX >= 0 && newX < mapWidth && newY >= 0 && newY < mapHeight) {
                const tile = this.mapData[newY][newX];
                if (tile !== 1 && tile !== 2) { // Not wall or table
                    this.isMoving = true;
                    p.gridX = newX;
                    p.gridY = newY;
                    p.dir = dir;

                    const px = newX * this.tileSize + this.tileSize / 2;
                    const py = newY * this.tileSize + this.tileSize / 2;

                    Network.sendMove(newX, newY, dir);
                    this.updateCharacterFrame(p, dir);

                    this.tweens.add({
                        targets: [p.sprite],
                        x: px, y: py,
                        duration: 150,
                        ease: 'Linear',
                        onComplete: () => { this.isMoving = false; }
                    });

                    this.tweens.add({
                        targets: [p.nameText],
                        x: px, y: py - this.tileSize / 2 - 14,
                        duration: 150
                    });
                    this.tweens.add({
                        targets: [p.statusText],
                        x: px, y: py - this.tileSize / 2 - 2,
                        duration: 150
                    });

                    if (p.bubbleText) {
                        this.tweens.add({
                            targets: [p.bubbleText],
                            x: px, y: py - this.tileSize - 10,
                            duration: 150
                        });
                    }
                } else {
                    // Blocked — just update facing direction
                    this.updateCharacterFrame(p, dir);
                }
            }
        }
    }
}

// Map constants (must match server)
const mapWidth = 20;
const mapHeight = 15;

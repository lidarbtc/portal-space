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
        // Load original gopher sprite for avatar 0
        this.load.image('gopher-src', 'assets/gopher.png');
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

    createAvatarSpritesheet() {
        const cols = 4; // directions: down, up, right, left
        const rows = 4; // avatar count (0=gopher, 1-3=canvas)
        const fw = 32, fh = 32;
        const canvas = document.createElement('canvas');
        canvas.width = cols * fw;
        canvas.height = rows * fh;
        const ctx = canvas.getContext('2d');

        // Row 0: Original gopher from characters.png
        const gopherSource = this.textures.get('gopher-src').getSourceImage();
        ctx.drawImage(gopherSource, 0, 0);

        // Rows 1-3: Canvas-generated colored avatars
        const palettes = [
            ['#4a90d9', '#2c5a8a', '#ffffff'], // blue
            ['#5cb85c', '#3a7a3a', '#ffffff'], // green
            ['#d94a4a', '#8a2c2c', '#ffffff'], // red
        ];

        for (let i = 0; i < palettes.length; i++) {
            const [body, outline, eye] = palettes[i];
            const avatarRow = i + 1; // offset by 1 (row 0 = gopher)
            for (let dir = 0; dir < cols; dir++) {
                const ox = dir * fw;
                const oy = avatarRow * fh;

                // Body
                ctx.fillStyle = outline;
                ctx.fillRect(ox + 8, oy + 6, 16, 20);
                ctx.fillStyle = body;
                ctx.fillRect(ox + 9, oy + 7, 14, 18);

                // Head
                ctx.fillStyle = outline;
                ctx.beginPath();
                ctx.arc(ox + 16, oy + 10, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.arc(ox + 16, oy + 10, 7, 0, Math.PI * 2);
                ctx.fill();

                // Eyes based on direction
                ctx.fillStyle = eye;
                if (dir === 0) { // down
                    ctx.fillRect(ox + 13, oy + 11, 2, 2);
                    ctx.fillRect(ox + 17, oy + 11, 2, 2);
                } else if (dir === 1) { // up - no eyes visible
                    // back of head
                } else if (dir === 2) { // right
                    ctx.fillRect(ox + 18, oy + 10, 2, 2);
                } else { // left
                    ctx.fillRect(ox + 12, oy + 10, 2, 2);
                }

                // Feet
                ctx.fillStyle = outline;
                ctx.fillRect(ox + 10, oy + 26, 4, 4);
                ctx.fillRect(ox + 18, oy + 26, 4, 4);
            }
        }

        this.textures.addSpriteSheet('characters', canvas, { frameWidth: fw, frameHeight: fh });
    }

    create() {
        // Build combined spritesheet: gopher (row 0) + canvas avatars (rows 1-3)
        this.createAvatarSpritesheet();

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

        UI.onEmoteSend = (emoji) => {
            Network.sendEmote(emoji);
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

        Network.on('emote', (msg) => {
            this.showEmote(msg.id, msg.emoji);
        });

        Network.on('chat', (msg) => {
            if (msg.id !== this.localPlayerId) {
                NotifyAudio.playIfHidden();
            }
            this.showChatBubble(msg.id, msg.text, msg.nickname);
            UI.addChatMessage(msg.nickname, msg.text);
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
                { fontSize: '24px', color: '#ff6b6b', fontFamily: 'MulmaruMono' }
            ).setOrigin(0.5).setScrollFactor(0).setDepth(1000).setResolution(2);
        });
    }

    addPlayer(info) {
        if (this.players[info.id]) return;

        const px = info.x * this.tileSize + this.tileSize / 2;
        const py = info.y * this.tileSize + this.tileSize / 2;

        // Frame index: avatar * 4 + direction (down=0, up=1, right=2, left=3)
        const dirFrame = { down: 0, up: 1, right: 2, left: 3 };
        const avatarIndex = info.avatar || 0;
        const frameIndex = avatarIndex * 4 + (dirFrame[info.dir] || 0);

        const sprite = this.add.sprite(px, py, 'characters', frameIndex);
        sprite.setDepth(10);

        // Name text
        const nameText = this.add.text(px, py - this.tileSize / 2 - 14, info.nickname, {
            fontSize: '12px',
            color: '#e0e0ff',
            fontFamily: 'MulmaruMono',
            stroke: '#000',
            strokeThickness: 2
        }).setOrigin(0.5).setDepth(11).setResolution(2);

        // Status text
        const statusLabel = this.getStatusLabel(info.status);
        const statusText = this.add.text(px, py - this.tileSize / 2 - 2, statusLabel, {
            fontSize: '12px',
            color: '#aaddaa',
            fontFamily: 'MulmaruMono',
            stroke: '#000',
            strokeThickness: 2
        }).setOrigin(0.5).setDepth(11).setResolution(2);

        this.players[info.id] = {
            sprite, nameText, statusText,
            gridX: info.x, gridY: info.y,
            dir: info.dir || 'down',
            avatar: avatarIndex,
            bubbleText: null, bubbleTimer: null,
            emoteText: null, emoteTimer: null
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
        if (p.emoteText) p.emoteText.destroy();
        if (p.emoteTimer) clearTimeout(p.emoteTimer);
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

        if (p.emoteText) {
            this.tweens.add({
                targets: [p.emoteText],
                x: px, y: py - this.tileSize - 24,
                duration: 150
            });
        }

        // Update character direction
        this.updateCharacterFrame(p, dir);
    }

    updateCharacterFrame(p, dir) {
        const dirFrame = { down: 0, up: 1, right: 2, left: 3 };
        p.sprite.setFrame((p.avatar || 0) * 4 + (dirFrame[dir] || 0));
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
            fontSize: '12px',
            color: '#ffffff',
            fontFamily: 'MulmaruMono',
            backgroundColor: '#333355dd',
            padding: { x: 6, y: 4 },
            stroke: '#000',
            strokeThickness: 1,
            wordWrap: { width: 200 }
        }).setOrigin(0.5).setDepth(100).setResolution(2);

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

    showEmote(id, emoji) {
        const p = this.players[id];
        if (!p) return;

        // Remove existing emote
        if (p.emoteText) {
            p.emoteText.destroy();
            clearTimeout(p.emoteTimer);
        }

        const px = p.sprite.x;
        const py = p.sprite.y - this.tileSize - 24;

        p.emoteText = this.add.text(px, py, emoji, {
            fontSize: '20px',
            fontFamily: 'MulmaruMono',
            stroke: '#000',
            strokeThickness: 2
        }).setOrigin(0.5).setDepth(101).setResolution(2);

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

                    if (p.emoteText) {
                        this.tweens.add({
                            targets: [p.emoteText],
                            x: px, y: py - this.tileSize - 24,
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

// Phaser game configuration
const config = {
    type: Phaser.AUTO,
    width: 640,   // 20 tiles × 32px
    height: 480,  // 15 tiles × 32px
    parent: 'game-container',
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#1a1a2e',
    scene: [LobbyScene, WorldScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

const game = new Phaser.Game(config);

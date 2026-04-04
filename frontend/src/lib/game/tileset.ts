import Phaser from 'phaser';

export function createPlaceholderTileset(scene: Phaser.Scene): void {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

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

  scene.textures.addCanvas('tileset', canvas);
}

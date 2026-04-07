import Phaser from 'phaser';

export function createAvatarSpritesheet(scene: Phaser.Scene): void {
  const fw = 32, fh = 32;

  // Row 0 only: Original gopher from gopher-src texture (128x32, 4 frames)
  const gopherSource = scene.textures.get('gopher-src').getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = gopherSource.width;
  canvas.height = fh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(gopherSource, 0, 0);

  scene.textures.addSpriteSheet('characters', canvas as unknown as HTMLImageElement, { frameWidth: fw, frameHeight: fh });
}

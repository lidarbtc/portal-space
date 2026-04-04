import Phaser from 'phaser';

export function createAvatarSpritesheet(scene: Phaser.Scene): void {
  const cols = 4; // directions: down, up, right, left
  const rows = 4; // avatar count (0=gopher, 1-3=canvas)
  const fw = 32, fh = 32;
  const canvas = document.createElement('canvas');
  canvas.width = cols * fw;
  canvas.height = rows * fh;
  const ctx = canvas.getContext('2d')!;

  // Row 0: Original gopher from gopher-src texture
  const gopherSource = scene.textures.get('gopher-src').getSourceImage() as HTMLImageElement;
  ctx.drawImage(gopherSource, 0, 0);

  // Rows 1-3: Canvas-generated colored avatars
  const palettes: [string, string, string][] = [
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

  scene.textures.addSpriteSheet('characters', canvas as unknown as HTMLImageElement, { frameWidth: fw, frameHeight: fh });
}

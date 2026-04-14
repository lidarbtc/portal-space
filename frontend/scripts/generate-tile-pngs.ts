/**
 * Generate individual tile PNG files (16x16).
 * One-time script to bootstrap tile assets.
 * Run: bun run scripts/generate-tile-pngs.ts
 */
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const TILE_SIZE = 16;
const OUTPUT_DIR = join(import.meta.dir, "../src/lib/game/tiles");

mkdirSync(OUTPUT_DIR, { recursive: true });

function createPNG(): PNG {
  return new PNG({ width: TILE_SIZE, height: TILE_SIZE });
}

function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function setPixel(
  png: PNG,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
) {
  if (x < 0 || x >= TILE_SIZE || y < 0 || y >= TILE_SIZE) return;
  const idx = (TILE_SIZE * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(
  png: PNG,
  sx: number,
  sy: number,
  w: number,
  h: number,
  hex: string,
) {
  const [r, g, b] = hexToRGB(hex);
  for (let y = sy; y < sy + h; y++) {
    for (let x = sx; x < sx + w; x++) {
      setPixel(png, x, y, r, g, b);
    }
  }
}

function strokeRect(
  png: PNG,
  sx: number,
  sy: number,
  w: number,
  h: number,
  hex: string,
) {
  const [r, g, b] = hexToRGB(hex);
  for (let x = sx; x < sx + w; x++) {
    setPixel(png, x, sy, r, g, b);
    setPixel(png, x, sy + h - 1, r, g, b);
  }
  for (let y = sy; y < sy + h; y++) {
    setPixel(png, sx, y, r, g, b);
    setPixel(png, sx + w - 1, y, r, g, b);
  }
}

function drawHLine(png: PNG, x1: number, x2: number, y: number, hex: string) {
  const [r, g, b] = hexToRGB(hex);
  for (let x = x1; x <= x2; x++) {
    setPixel(png, x, y, r, g, b);
  }
}

function drawVLine(png: PNG, x: number, y1: number, y2: number, hex: string) {
  const [r, g, b] = hexToRGB(hex);
  for (let y = y1; y <= y2; y++) {
    setPixel(png, x, y, r, g, b);
  }
}

function fillCircle(
  png: PNG,
  cx: number,
  cy: number,
  radius: number,
  hex: string,
) {
  const [r, g, b] = hexToRGB(hex);
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
        setPixel(png, x, y, r, g, b);
      }
    }
  }
}

function savePNG(png: PNG, name: string) {
  const buffer = PNG.sync.write(png);
  const path = join(OUTPUT_DIR, name);
  writeFileSync(path, buffer);
  console.log(`  Created: ${path}`);
}

// Tile 0: Floor (light tan with subtle grid)
function generateFloor() {
  const png = createPNG();
  fillRect(png, 0, 0, 16, 16, "#c4a882");
  strokeRect(png, 0, 0, 16, 16, "#b89b75");
  savePNG(png, "floor.png");
}

// Tile 1: Wall (dark brown with brick pattern)
function generateWall() {
  const png = createPNG();
  fillRect(png, 0, 0, 16, 16, "#4a3728");
  strokeRect(png, 0, 0, 16, 16, "#3a2a1e");
  // Brick pattern (scaled for 16px)
  drawHLine(png, 0, 15, 8, "#5a4738");
  drawVLine(png, 8, 0, 7, "#5a4738");
  drawVLine(png, 4, 8, 15, "#5a4738");
  drawVLine(png, 12, 8, 15, "#5a4738");
  savePNG(png, "wall.png");
}

// Tile 2: Table (gray with monitor)
function generateTable() {
  const png = createPNG();
  fillRect(png, 0, 0, 16, 16, "#8b7355");
  fillRect(png, 1, 1, 14, 14, "#7a6248");
  // Monitor (scaled for 16px)
  fillRect(png, 4, 3, 8, 6, "#334455");
  fillRect(png, 5, 4, 6, 4, "#66aadd");
  savePNG(png, "table.png");
}

// Tile 3: Plant (tan base with green foliage)
function generatePlant() {
  const png = createPNG();
  fillRect(png, 0, 0, 16, 16, "#c4a882");
  // Pot
  fillRect(png, 6, 10, 4, 6, "#6b4226");
  // Foliage
  fillCircle(png, 8, 8, 5, "#2d8a4e");
  fillCircle(png, 7, 7, 3, "#3aaf5c");
  savePNG(png, "plant.png");
}

console.log("Generating 16x16 tile PNGs...");
generateFloor();
generateWall();
generateTable();
generatePlant();
console.log("Done!");

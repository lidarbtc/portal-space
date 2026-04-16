/**
 * Build tileset spritesheet from individual tile PNGs.
 * Combines all PNGs in tiles/ into a single horizontal spritesheet + Tiled-compatible JSON.
 * Run: bun run build:tileset
 */
import { PNG } from 'pngjs'
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const TILE_SIZE = 16
const TILES_DIR = join(import.meta.dir, '../src/lib/game/tiles')
const OUTPUT_DIR = join(import.meta.dir, '../static/assets')

// Read all PNG files from tiles directory, sorted alphabetically
const tileFiles = readdirSync(TILES_DIR)
	.filter((f) => f.endsWith('.png'))
	.sort()

if (tileFiles.length === 0) {
	console.error('No tile PNGs found in', TILES_DIR)
	process.exit(1)
}

console.log(`Building tileset from ${tileFiles.length} tiles...`)

// Read all tile PNGs
const tiles: PNG[] = tileFiles.map((file) => {
	const data = readFileSync(join(TILES_DIR, file))
	return PNG.sync.read(data)
})

// Create spritesheet (horizontal strip)
const sheetWidth = TILE_SIZE * tiles.length
const sheetHeight = TILE_SIZE
const sheet = new PNG({ width: sheetWidth, height: sheetHeight })

// Copy each tile into the spritesheet
tiles.forEach((tile, index) => {
	const offsetX = index * TILE_SIZE
	for (let y = 0; y < TILE_SIZE; y++) {
		for (let x = 0; x < TILE_SIZE; x++) {
			const srcIdx = (TILE_SIZE * y + x) << 2
			const dstIdx = (sheetWidth * y + (offsetX + x)) << 2
			sheet.data[dstIdx] = tile.data[srcIdx]
			sheet.data[dstIdx + 1] = tile.data[srcIdx + 1]
			sheet.data[dstIdx + 2] = tile.data[srcIdx + 2]
			sheet.data[dstIdx + 3] = tile.data[srcIdx + 3]
		}
	}
})

// Write spritesheet PNG
const sheetPath = join(OUTPUT_DIR, 'tileset.png')
writeFileSync(sheetPath, PNG.sync.write(sheet))
console.log(`  Spritesheet: ${sheetPath} (${sheetWidth}x${sheetHeight})`)

// Generate Tiled-compatible tileset JSON
// Tile names derived from filenames (without .png extension)
const tileNames = tileFiles.map((f) => f.replace('.png', ''))

interface TiledTileset {
	columns: number
	image: string
	imageheight: number
	imagewidth: number
	margin: number
	name: string
	spacing: number
	tilecount: number
	tiledversion: string
	tileheight: number
	tilewidth: number
	type: string
	version: string
	tiles: Array<{
		id: number
		type: string
		properties?: Array<{ name: string; type: string; value: boolean }>
	}>
}

const tilesetJson: TiledTileset = {
	columns: tiles.length,
	image: 'tileset.png',
	imageheight: sheetHeight,
	imagewidth: sheetWidth,
	margin: 0,
	name: 'tileset',
	spacing: 0,
	tilecount: tiles.length,
	tiledversion: '1.11.2',
	tileheight: TILE_SIZE,
	tilewidth: TILE_SIZE,
	type: 'tileset',
	version: '1.10',
	tiles: tileNames.map((name, id) => {
		const tile: TiledTileset['tiles'][number] = { id, type: name }
		// wall and table tiles have collision
		if (name === 'wall' || name === 'table') {
			tile.properties = [{ name: 'collides', type: 'bool', value: true }]
		}
		return tile
	}),
}

const jsonPath = join(OUTPUT_DIR, 'tileset.json')
writeFileSync(jsonPath, JSON.stringify(tilesetJson, null, 2))
console.log(`  Tileset JSON: ${jsonPath}`)

console.log(`\nTile mapping:`)
tileNames.forEach((name, id) => {
	const collides = name === 'wall' || name === 'table' ? ' (collides)' : ''
	console.log(`  ID ${id}: ${name}${collides}`)
})

// Post-process: inline tileset into map.json (Phaser doesn't load external tileset refs)
const mapPath = join(OUTPUT_DIR, 'map.json')
try {
	const mapJson = JSON.parse(readFileSync(mapPath, 'utf-8'))
	const inlinedTileset = {
		...tilesetJson,
		firstgid: mapJson.tilesets?.[0]?.firstgid ?? 1,
	}
	mapJson.tilesets = [inlinedTileset]
	writeFileSync(mapPath, JSON.stringify(mapJson, null, 2))
	console.log(`\n  Inlined tileset into map.json`)
} catch {
	console.log(`\n  Warning: map.json not found, skipping inline step`)
}

console.log('\nDone!')

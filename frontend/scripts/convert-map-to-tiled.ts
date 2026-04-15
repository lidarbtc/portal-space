/**
 * One-time script: Convert the hardcoded map data from world.ts into Tiled JSON format.
 * After running this, edit the map in Tiled editor directly.
 * Run: bun run scripts/convert-map-to-tiled.ts
 */
import { writeFileSync } from 'fs'
import { join } from 'path'

const MAP_WIDTH = 60
const MAP_HEIGHT = 45
const TILE_SIZE = 16

// Tile IDs (matching alphabetical sort order of PNGs: floor=0, plant=1, table=2, wall=3)
// Wait - Tiled uses 0 as "empty", so tile GIDs start at 1.
// In Tiled JSON: 0 = empty, 1 = first tile (floor), 2 = second tile (plant), etc.
// Our alphabetical order: floor.png=0, plant.png=1, table.png=2, wall.png=3
// Tiled GID: floor=1, plant=2, table=3, wall=4

const FLOOR_GID = 1 // floor.png (index 0 + 1)
const PLANT_GID = 2 // plant.png (index 1 + 1)
const TABLE_GID = 3 // table.png (index 2 + 1)
const WALL_GID = 4 // wall.png (index 3 + 1)

// Generate ground layer (all floor tiles)
function generateGroundLayer(): number[] {
	return new Array(MAP_WIDTH * MAP_HEIGHT).fill(FLOOR_GID)
}

// Generate walls layer (border walls only)
function generateWallsLayer(): number[] {
	const data = new Array(MAP_WIDTH * MAP_HEIGHT).fill(0)
	for (let y = 0; y < MAP_HEIGHT; y++) {
		for (let x = 0; x < MAP_WIDTH; x++) {
			if (y === 0 || y === MAP_HEIGHT - 1 || x === 0 || x === MAP_WIDTH - 1) {
				data[y * MAP_WIDTH + x] = WALL_GID
			}
		}
	}
	return data
}

// Generate furniture layer (tables from baseTables pattern)
function generateFurnitureLayer(): number[] {
	const data = new Array(MAP_WIDTH * MAP_HEIGHT).fill(0)

	const baseTables: [number, number][] = [
		[4, 4],
		[5, 4],
		[4, 7],
		[5, 7],
		[4, 10],
		[5, 10],
		[10, 4],
		[11, 4],
		[10, 7],
		[11, 7],
		[10, 10],
		[11, 10],
		[16, 4],
		[17, 4],
		[16, 7],
		[17, 7],
		[16, 10],
		[17, 10],
	]

	for (let blockY = 0; blockY < Math.floor(MAP_HEIGHT / 15); blockY++) {
		for (let blockX = 0; blockX < Math.floor(MAP_WIDTH / 20); blockX++) {
			baseTables.forEach(([bx, by]) => {
				const x = bx + blockX * 20
				const y = by + blockY * 15
				if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
					data[y * MAP_WIDTH + x] = TABLE_GID
				}
			})
		}
	}

	return data
}

// Generate decoration layer (empty for now - add plants in Tiled editor)
function generateDecorationLayer(): number[] {
	return new Array(MAP_WIDTH * MAP_HEIGHT).fill(0)
}

// Build Tiled JSON map
const tiledMap = {
	compressionlevel: -1,
	height: MAP_HEIGHT,
	infinite: false, // Fixed size map - required for Phaser compatibility
	layers: [
		{
			data: generateGroundLayer(),
			height: MAP_HEIGHT,
			id: 1,
			name: 'ground',
			opacity: 1,
			type: 'tilelayer',
			visible: true,
			width: MAP_WIDTH,
			x: 0,
			y: 0,
		},
		{
			data: generateWallsLayer(),
			height: MAP_HEIGHT,
			id: 2,
			name: 'walls',
			opacity: 1,
			type: 'tilelayer',
			visible: true,
			width: MAP_WIDTH,
			x: 0,
			y: 0,
		},
		{
			data: generateFurnitureLayer(),
			height: MAP_HEIGHT,
			id: 3,
			name: 'furniture',
			opacity: 1,
			type: 'tilelayer',
			visible: true,
			width: MAP_WIDTH,
			x: 0,
			y: 0,
		},
		{
			data: generateDecorationLayer(),
			height: MAP_HEIGHT,
			id: 4,
			name: 'decoration',
			opacity: 1,
			type: 'tilelayer',
			visible: true,
			width: MAP_WIDTH,
			x: 0,
			y: 0,
		},
	],
	nextlayerid: 5,
	nextobjectid: 1,
	orientation: 'orthogonal',
	renderorder: 'right-down',
	tiledversion: '1.11.2',
	tileheight: TILE_SIZE,
	tilesets: [
		{
			columns: 4,
			firstgid: 1,
			image: 'tileset.png',
			imageheight: TILE_SIZE,
			imagewidth: TILE_SIZE * 4,
			margin: 0,
			name: 'tileset',
			spacing: 0,
			tilecount: 4,
			tileheight: TILE_SIZE,
			tilewidth: TILE_SIZE,
			tiles: [
				{ id: 0, type: 'floor' },
				{ id: 1, type: 'plant' },
				{ id: 2, type: 'table', properties: [{ name: 'collides', type: 'bool', value: true }] },
				{ id: 3, type: 'wall', properties: [{ name: 'collides', type: 'bool', value: true }] },
			],
		},
	],
	tilewidth: TILE_SIZE,
	type: 'map',
	version: '1.10',
	width: MAP_WIDTH,
}

const outputPath = join(import.meta.dir, '../static/assets/map.json')
writeFileSync(outputPath, JSON.stringify(tiledMap, null, 2))
console.log(`Tiled map written to: ${outputPath}`)
console.log(`  Size: ${MAP_WIDTH}x${MAP_HEIGHT} tiles`)
console.log(`  Layers: ground, walls, furniture, decoration`)
console.log(
	`  Tile GIDs: floor=${FLOOR_GID}, plant=${PLANT_GID}, table=${TABLE_GID}, wall=${WALL_GID}`,
)
console.log(`\nNote: Tiled GIDs = tile index + 1 (0 means empty in Tiled)`)
console.log(`Open map.json in Tiled editor to visually edit the map.`)

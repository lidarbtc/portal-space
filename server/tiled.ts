// Tiled object layer parser.
//
// CRITICAL INVARIANT: parse keys on `obj.name` (stable across resaves),
// NOT `obj.id` (numeric, reshuffled on resave). Each parsed object emits
// id = 'tiled:<name>', which cannot collide with runtime nanoid ids
// (nanoid alphabet excludes ':').

export interface ParsedTiledObject {
	id: string // 'tiled:<name>'
	name: string
	type: string
	x: number
	y: number
	properties: Record<string, string | number | boolean>
}

interface TiledRawProperty {
	name: string
	type: string
	value: unknown
}

interface TiledRawObject {
	id?: number
	name?: string
	type?: string
	x?: number
	y?: number
	properties?: TiledRawProperty[]
}

interface TiledRawLayer {
	type: string
	name?: string
	objects?: TiledRawObject[]
}

interface TiledRawMap {
	layers?: TiledRawLayer[]
}

export function parseObjectLayer(mapJson: unknown): ParsedTiledObject[] {
	if (!isObject(mapJson)) return []
	const map = mapJson as TiledRawMap
	if (!Array.isArray(map.layers)) return []

	const results: ParsedTiledObject[] = []
	const seen = new Set<string>()

	for (const layer of map.layers) {
		if (!layer || layer.type !== 'objectgroup') continue
		if (!Array.isArray(layer.objects)) continue

		for (const obj of layer.objects) {
			if (!obj) continue
			const name = typeof obj.name === 'string' ? obj.name : ''
			if (!name) {
				console.warn('[tiled] skipping object with empty name (id=', obj.id, ')')
				continue
			}
			if (seen.has(name)) {
				console.warn('[tiled] duplicate object name:', name)
				continue
			}
			seen.add(name)

			const type = typeof obj.type === 'string' ? obj.type : ''
			const x = typeof obj.x === 'number' ? obj.x : 0
			const y = typeof obj.y === 'number' ? obj.y : 0

			const properties: Record<string, string | number | boolean> = {}
			if (Array.isArray(obj.properties)) {
				for (const prop of obj.properties) {
					if (!prop || typeof prop.name !== 'string') continue
					const v = prop.value
					if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
						properties[prop.name] = v
					}
				}
			}

			results.push({
				id: 'tiled:' + name,
				name,
				type,
				x,
				y,
				properties,
			})
		}
	}

	return results
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v)
}

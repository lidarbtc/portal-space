// 3-layer boot merge for interactive objects.
//
// Final InteractiveObject list = Tiled-seeded base (with state merged from
// defaultState ← Tiled per-instance properties ← Storage overlay) UNION
// Storage-only runtime /place rows. Unknown types are filtered out with a
// warning; DB rows are retained (no data loss).

import type { InteractiveObject } from '@shared/types'
import type { ObjectsConfig } from '@shared/config'
import type { Storage, StoredObject } from './storage'
import { parseObjectLayer, type ParsedTiledObject } from './tiled'

const REGIONAL_CHAT_PROP_MAP: Record<string, string> = {
	stateName: 'name',
	stateRadius: 'radius',
	stateRetain: 'retainHistory',
}

export function loadObjects(
	tiledJson: unknown,
	storage: Storage,
	config: ObjectsConfig,
	roomId: string,
): InteractiveObject[] {
	const tiled = parseObjectLayer(tiledJson)
	const storageRows = storage.listObjectsByRoom(roomId)
	const storageById = new Map<string, StoredObject>()
	for (const row of storageRows) {
		storageById.set(row.id, row)
	}

	const results: InteractiveObject[] = []
	const seenIds = new Set<string>()

	// Layer 1: Tiled-seeded objects (id = 'tiled:<name>')
	for (const t of tiled) {
		if (!config.types[t.type]) {
			console.warn(
				`[objects-config] skipping tiled object '${t.name}': unknown type '${t.type}'`,
			)
			continue
		}
		const obj: InteractiveObject = {
			id: t.id,
			type: t.type,
			x: t.x,
			y: t.y,
			state: mergeState(t.type, config, t, storageById.get(t.id)),
		}
		results.push(obj)
		seenIds.add(t.id)
	}

	// Layer 2: runtime Storage rows not already accounted for by Tiled overlay
	for (const row of storageRows) {
		if (seenIds.has(row.id)) continue
		if (!config.types[row.type]) {
			console.warn(
				`[objects-config] skipping orphan: type=${row.type} id=${row.id} (type removed from YAML)`,
			)
			continue
		}
		const obj: InteractiveObject = {
			id: row.id,
			type: row.type,
			x: row.x,
			y: row.y,
			state: row.state,
			ownerId: row.ownerId || undefined,
			placedAt: row.placedAt,
		}
		results.push(obj)
	}

	return results
}

/**
 * Exposed for tests — merge per-instance state given a Tiled object, its
 * optional Storage override, and the YAML default.
 */
export function mergeState(
	type: string,
	config: ObjectsConfig,
	tiled: ParsedTiledObject | null,
	storageOverlay: StoredObject | undefined,
): unknown {
	const def = config.types[type]
	const layer1 = cloneState(def?.defaultState)
	const layer2 = tiled ? stateFromTiledProperties(type, tiled.properties) : null
	const layer3 =
		storageOverlay && storageOverlay.state !== undefined && storageOverlay.state !== null
			? storageOverlay.state
			: null

	if (!isObject(layer1) && !isObject(layer2) && !isObject(layer3)) {
		// Prefer the highest-priority non-null scalar/undefined
		if (layer3 !== null) return layer3
		if (layer2 !== null) return layer2
		return layer1 === undefined ? null : layer1
	}

	const merged: Record<string, unknown> = {}
	if (isObject(layer1)) Object.assign(merged, layer1)
	if (isObject(layer2)) Object.assign(merged, layer2)
	if (isObject(layer3)) Object.assign(merged, layer3)
	return merged
}

function stateFromTiledProperties(
	type: string,
	props: Record<string, string | number | boolean>,
): Record<string, unknown> | null {
	if (type === 'regional_chat') {
		const out: Record<string, unknown> = {}
		let any = false
		for (const [src, dst] of Object.entries(REGIONAL_CHAT_PROP_MAP)) {
			if (src in props) {
				out[dst] = props[src]
				any = true
			}
		}
		return any ? out : null
	}
	return null
}

function cloneState(value: unknown): unknown {
	if (value === undefined || value === null) return value
	if (typeof value !== 'object') return value
	// Shallow object clone is sufficient for the shapes we use in v1.
	return { ...(value as Record<string, unknown>) }
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Shared configuration loader for interactive object types.
// Pure function — no I/O. Callers supply the raw YAML string.
// Server reads via Bun.file(...).text(); frontend bundles via Vite ?raw import.

import { parse as parseYaml } from 'yaml'

export type HitShape = 'rect' | 'circle'

export interface HitRect {
	x: number
	y: number
	w: number
	h: number
}

export interface HitCircle {
	radius: number
}

export interface ObjectTypeDef {
	sprite: string
	interactionRadius: number
	hitShape: HitShape
	hitRect?: HitRect
	hitCircle?: HitCircle
	defaultState?: unknown
}

export interface ObjectsConfig {
	quotaPerUser: number
	types: Record<string, ObjectTypeDef>
}

const ALLOWED_TOP_LEVEL_KEYS = new Set(['quotaPerUser', 'types'])
const ALLOWED_HIT_SHAPES: ReadonlySet<string> = new Set(['rect', 'circle'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTypeDef(name: string, raw: unknown): ObjectTypeDef {
	if (!isPlainObject(raw)) {
		throw new Error(`[objects-config] type '${name}' must be an object`)
	}
	const sprite = raw.sprite
	if (typeof sprite !== 'string' || sprite.length === 0) {
		throw new Error(`[objects-config] type '${name}' is missing required string 'sprite'`)
	}
	const interactionRadius = raw.interactionRadius
	if (typeof interactionRadius !== 'number' || !Number.isFinite(interactionRadius)) {
		throw new Error(`[objects-config] type '${name}' is missing numeric 'interactionRadius'`)
	}
	const hitShape = raw.hitShape
	if (typeof hitShape !== 'string' || !ALLOWED_HIT_SHAPES.has(hitShape)) {
		throw new Error(
			`[objects-config] type '${name}' has invalid hitShape '${String(hitShape)}' (allowed: rect|circle)`,
		)
	}

	const def: ObjectTypeDef = {
		sprite,
		interactionRadius,
		hitShape: hitShape as HitShape,
	}

	if (raw.hitRect !== undefined) {
		const r = raw.hitRect
		if (
			!isPlainObject(r) ||
			typeof r.x !== 'number' ||
			typeof r.y !== 'number' ||
			typeof r.w !== 'number' ||
			typeof r.h !== 'number'
		) {
			throw new Error(`[objects-config] type '${name}' has malformed hitRect`)
		}
		def.hitRect = { x: r.x, y: r.y, w: r.w, h: r.h }
	}

	if (raw.hitCircle !== undefined) {
		const c = raw.hitCircle
		if (!isPlainObject(c) || typeof c.radius !== 'number') {
			throw new Error(`[objects-config] type '${name}' has malformed hitCircle`)
		}
		def.hitCircle = { radius: c.radius }
	}

	if ('defaultState' in raw) {
		def.defaultState = raw.defaultState
	}

	// Unknown fields inside types.* are allowed (additive-only schema evolution).
	return def
}

export function loadObjectConfig(raw: string): ObjectsConfig {
	const parsed: unknown = parseYaml(raw)
	if (!isPlainObject(parsed)) {
		throw new Error('[objects-config] top-level YAML must be an object')
	}

	for (const key of Object.keys(parsed)) {
		if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
			throw new Error(`[objects-config] unknown top-level key '${key}'`)
		}
	}

	const quotaRaw = parsed.quotaPerUser
	if (typeof quotaRaw !== 'number' || !Number.isInteger(quotaRaw) || quotaRaw < 1) {
		throw new Error(
			`[objects-config] quotaPerUser must be a positive integer, got ${String(quotaRaw)}`,
		)
	}

	const typesRaw = parsed.types
	if (!isPlainObject(typesRaw)) {
		throw new Error('[objects-config] types must be an object')
	}

	const types: Record<string, ObjectTypeDef> = {}
	for (const [name, value] of Object.entries(typesRaw)) {
		types[name] = parseTypeDef(name, value)
	}

	return {
		quotaPerUser: quotaRaw,
		types,
	}
}

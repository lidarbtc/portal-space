// Client-side interactive-object catalog — the same YAML bytes the server
// reads at boot, bundled into the client at build time via Vite ?raw.
// Single source of truth → no runtime drift possible.

import { loadObjectConfig, type ObjectTypeDef, type ObjectsConfig } from '@shared/config'
import rawYaml from '@shared/objects.config.yaml?raw'

let cached: ObjectsConfig | null = null

export function getObjectsConfig(): ObjectsConfig {
	if (!cached) {
		cached = loadObjectConfig(rawYaml)
	}
	return cached
}

export function getTypeDef(typeName: string): ObjectTypeDef | undefined {
	return getObjectsConfig().types[typeName]
}

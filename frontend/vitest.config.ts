import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		exclude: ['src/server/storage.test.ts', 'src/server/yjs-relay.test.ts'],
	},
})

import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'@shared': resolve(__dirname, '../shared'),
		},
	},
	server: {
		fs: {
			allow: ['../shared'],
		},
		proxy: {
			'/ws': {
				target: 'ws://localhost:3001',
				ws: true,
			},
			'/peer': {
				target: 'http://localhost:3001',
				ws: true,
			},
		},
	},
})

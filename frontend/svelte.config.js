import adapter from '@sveltejs/adapter-static'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
		}),
		paths: {
			base: '',
		},
		alias: {
			'@shared': resolve(__dirname, '../shared'),
			'@shared/*': resolve(__dirname, '../shared/*'),
		},
	},
}

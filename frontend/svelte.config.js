import adapter from '@sveltejs/adapter-static'

export default {
	kit: {
		adapter: adapter({
			pages: '../static',
			assets: '../static',
			fallback: 'index.html',
		}),
		paths: {
			base: '',
		},
	},
}

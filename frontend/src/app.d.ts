// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Vite ?raw — bundles file contents as a string at build time.
declare module '*.yaml?raw' {
	const contents: string
	export default contents
}

declare module '*.yml?raw' {
	const contents: string
	export default contents
}

export {}

import { readable } from 'svelte/store'

const MOBILE_BREAKPOINT = '(max-width: 767px)'

export const isMobile = readable(false, (set) => {
	if (typeof window === 'undefined') return

	const mql = window.matchMedia(MOBILE_BREAKPOINT)
	set(mql.matches)

	function onChange(e: MediaQueryListEvent) {
		set(e.matches)
	}

	mql.addEventListener('change', onChange)
	return () => mql.removeEventListener('change', onChange)
})

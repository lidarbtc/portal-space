<script lang="ts">
	import '../app.css'
	import Metadata from '$lib/components/Metadata.svelte'
	import GNB from '$lib/components/GNB.svelte'
	import { Toaster } from 'svelte-sonner'
	let { children } = $props()
</script>

<Metadata />
<Toaster richColors theme="dark" position="top-center" />
<div class="app-shell">
	<GNB />
	<main class="app-main">
		{@render children()}
	</main>
</div>

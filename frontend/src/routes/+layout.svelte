<script lang="ts">
  import '../app.css';
  import Metadata from '$lib/components/Metadata.svelte';
  import GNB from '$lib/components/GNB.svelte';
  let { children } = $props();
</script>

<Metadata />
<div class="app-shell">
  <GNB />
  <main class="app-main">
    {@render children()}
  </main>
</div>

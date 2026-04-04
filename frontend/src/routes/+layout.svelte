<script lang="ts">
  import '../app.css';
  import Metadata from '$lib/components/Metadata.svelte';
  let { children } = $props();
</script>

<Metadata />
{@render children()}

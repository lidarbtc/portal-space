<script lang="ts">
	import { gameState } from '$lib/stores/game.svelte'
</script>

<div id="player-count">접속: {gameState.playerCount}명</div>

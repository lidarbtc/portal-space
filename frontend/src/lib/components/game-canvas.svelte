<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity'
	import { onMount, onDestroy } from 'svelte'
	import Phaser from 'phaser'
	import { createGameConfig } from '$lib/game/config'
	import { gameState } from '$lib/stores/game.svelte'
	import { objectsState } from '$lib/stores/objects.svelte'
	import type { OutgoingMessage, InteractiveObject } from '$lib/types'

	let { snapshot }: { snapshot: OutgoingMessage | null } = $props()

	let container: HTMLDivElement
	let game: Phaser.Game | null = null

	onMount(() => {
		// Initialize stores from snapshot data before creating game
		if (snapshot) {
			if (snapshot.self) {
				gameState.selfId = snapshot.self.id
				const initial = new SvelteMap<string, typeof snapshot.self>()
				initial.set(snapshot.self.id, snapshot.self)
				if (snapshot.players) {
					snapshot.players.forEach((p) => initial.set(p.id, p))
				}
				gameState.players = initial
				gameState.addSystemMessage(snapshot.self.nickname + '님이 입장했습니다.')
			}

			// Initialize interactive objects from snapshot
			if (snapshot.objects) {
				const objMap = new SvelteMap<string, InteractiveObject>()
				snapshot.objects.forEach((obj) => objMap.set(obj.id, obj))
				objectsState.objects = objMap
			}
		}

		game = new Phaser.Game(createGameConfig(container))
	})

	onDestroy(() => {
		game?.destroy(true)
		game = null
	})

	// HMR dispose hook — prevents canvas accumulation during dev
	if (import.meta.hot) {
		import.meta.hot.dispose(() => {
			game?.destroy(true)
		})
	}
</script>

<div bind:this={container}></div>

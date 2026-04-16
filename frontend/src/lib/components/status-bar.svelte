<script lang="ts">
	import { ToggleGroup } from 'bits-ui'
	import { gameState } from '$lib/stores/game.svelte'
	import { network } from '$lib/network'
	import type { PlayerStatus } from '@shared/types'

	const statuses: { key: PlayerStatus; label: string; color: string }[] = [
		{ key: 'online', label: '온라인', color: '#4ade80' },
		{ key: 'away', label: '자리비움', color: '#eab308' },
		{ key: 'dnd', label: '방해금지', color: '#ef4444' },
	]
</script>

<ToggleGroup.Root
	type="single"
	id="status-bar"
	value={gameState.currentStatus}
	onValueChange={(value) => {
		if (value) {
			const status = value as PlayerStatus
			gameState.currentStatus = status
			network.sendStatus(status)
		}
	}}
>
	{#each statuses as { key, label, color } (key)}
		<ToggleGroup.Item value={key}>
			<span style="color: {color}">●</span>
			{label}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>

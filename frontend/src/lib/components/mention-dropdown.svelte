<script lang="ts">
	import type { PlayerInfo } from '@shared/types'
	import { DEFAULT_COLORS } from '$lib/game/palette-swap'

	let {
		players,
		filter,
		selectedIndex,
		visible,
		onselect,
	}: {
		players: PlayerInfo[]
		filter: string
		selectedIndex: number
		visible: boolean
		onselect: (player: PlayerInfo) => void
	} = $props()

	const MAX_DISPLAY = 20

	let filteredPlayers = $derived.by(() => {
		const f = filter.toLowerCase()
		const filtered = f ? players.filter((p) => p.nickname.toLowerCase().startsWith(f)) : players
		return filtered.slice(0, MAX_DISPLAY)
	})

	function handleItemClick(player: PlayerInfo) {
		onselect(player)
	}
</script>

{#if visible && filteredPlayers.length > 0}
	<div class="mention-dropdown" role="listbox" aria-label="플레이어 멘션">
		{#each filteredPlayers as player, i (player.id)}
			<button
				class="mention-item"
				class:selected={i === selectedIndex}
				role="option"
				aria-selected={i === selectedIndex}
				onmousedown={(e) => {
					e.preventDefault()
					handleItemClick(player)
				}}
			>
				<span
					class="mention-avatar-dot"
					style:background={player.colors?.body ?? DEFAULT_COLORS.body}
				></span>
				<span class="mention-nickname">{player.nickname}</span>
				{#if player.customStatus}
					<span class="mention-custom-status">{player.customStatus}</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.mention-dropdown {
		position: absolute;
		bottom: 100%;
		left: 0;
		right: 0;
		max-height: 200px;
		overflow-y: auto;
		background: rgba(16, 24, 48, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		margin-bottom: 4px;
		z-index: 100;
		display: flex;
		flex-direction: column;
	}

	.mention-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border: none;
		background: transparent;
		color: #ccccdd;
		font-family: 'MulmaruMono', monospace;
		font-size: 0.8125rem;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.mention-item:hover,
	.mention-item.selected {
		background: var(--color-primary);
		color: #0a0a1a;
	}

	.mention-avatar-dot {
		flex: 0 0 auto;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.mention-nickname {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mention-custom-status {
		flex: 0 0 auto;
		font-size: 0.6875rem;
		color: #888899;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100px;
	}

	.mention-item.selected .mention-custom-status {
		color: rgba(10, 10, 26, 0.6);
	}
</style>

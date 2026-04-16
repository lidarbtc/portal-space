<script lang="ts">
	import type { PlayerInfo } from '@shared/types'
	import { DEFAULT_COLORS } from '$lib/game/palette-swap'

	let {
		player,
		nickname,
		open,
		anchorPosition,
		onclose,
	}: {
		player: PlayerInfo | null
		nickname: string
		open: boolean
		anchorPosition: { x: number; y: number }
		onclose: () => void
	} = $props()

	function handleClickOutside(e: MouseEvent) {
		if (!open) return
		const target = e.target as HTMLElement
		if (!target.closest('.profile-popup')) {
			onclose()
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return
		if (e.key === 'Escape') {
			onclose()
		}
	}

	let statusLabel = $derived.by(() => {
		if (!player) return '오프라인'
		switch (player.status) {
			case 'online':
				return '온라인'
			case 'away':
				return '자리비움'
			case 'dnd':
				return '방해금지'
			default:
				return '온라인'
		}
	})

	let statusClass = $derived(!player ? 'offline' : player.status)
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

{#if open}
	<div class="profile-popup" style:left="{anchorPosition.x}px" style:top="{anchorPosition.y}px">
		<div class="profile-header">
			<span
				class="profile-avatar-dot"
				style:background={player?.colors?.body ?? DEFAULT_COLORS.body}
			></span>
			<span class="profile-nickname">{player?.nickname ?? nickname}</span>
		</div>
		<div class="profile-status">
			<span class="status-indicator {statusClass}"></span>
			<span class="status-label">{statusLabel}</span>
		</div>
		{#if player?.customStatus}
			<div class="profile-custom-status">{player.customStatus}</div>
		{/if}
	</div>
{/if}

<style>
	.profile-popup {
		position: fixed;
		z-index: 200;
		background: rgba(16, 24, 48, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		padding: 12px;
		min-width: 160px;
		max-width: 240px;
		font-family: 'MulmaruMono', monospace;
	}

	.profile-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.profile-avatar-dot {
		flex: 0 0 auto;
		width: 16px;
		height: 16px;
		border-radius: 50%;
	}

	.profile-nickname {
		color: #e0e0ff;
		font-size: 0.9375rem;
		font-weight: bold;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.profile-status {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.status-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.status-indicator.online {
		background: #66cc66;
	}

	.status-indicator.away {
		background: #cccc66;
	}

	.status-indicator.dnd {
		background: #cc6666;
	}

	.status-indicator.offline {
		background: #666677;
	}

	.status-label {
		color: #888899;
		font-size: 0.75rem;
	}

	.profile-custom-status {
		margin-top: 6px;
		padding-top: 6px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		color: #aaaabb;
		font-size: 0.75rem;
		word-break: break-word;
	}
</style>

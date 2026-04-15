<script lang="ts">
	import { zoomLevel, zoomIn, zoomOut, resetZoom, ZOOM_STEPS } from '$lib/stores/zoom'
</script>

<div class="zoom-controls">
	<button class="zoom-btn" onclick={zoomOut} disabled={$zoomLevel <= ZOOM_STEPS[0]} title="줌 아웃">
		&minus;
	</button>
	<span class="zoom-level">{$zoomLevel}x</span>
	<button
		class="zoom-btn"
		onclick={zoomIn}
		disabled={$zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
		title="줌 인"
	>
		+
	</button>
	{#if $zoomLevel !== 1}
		<button class="zoom-reset" onclick={resetZoom} title="기본 줌으로 리셋"> 1x </button>
	{/if}
</div>

<style>
	.zoom-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.zoom-btn {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		color: #e0e0ff;
		font-size: 15px;
		font-family: 'MulmaruMono', monospace;
		transition: background 0.15s;
	}

	.zoom-btn:hover:not(:disabled) {
		background: rgba(6, 182, 212, 0.25);
	}

	.zoom-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.zoom-level {
		color: #e0e0ff;
		font-size: 12px;
		font-family: 'MulmaruMono', monospace;
		min-width: 32px;
		text-align: center;
		user-select: none;
	}

	.zoom-reset {
		all: unset;
		cursor: pointer;
		padding: 2px 8px;
		margin-left: 2px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		color: #aaaacc;
		font-size: 11px;
		font-family: 'MulmaruMono', monospace;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.zoom-reset:hover {
		background: rgba(6, 182, 212, 0.25);
		color: #e0e0ff;
	}
</style>

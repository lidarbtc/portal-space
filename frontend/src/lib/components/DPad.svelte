<script lang="ts">
	import { dpadDirection } from '$lib/stores/dpad';

	function handleTouchStart(direction: 'up' | 'down' | 'left' | 'right') {
		return (e: TouchEvent) => {
			e.preventDefault();
			dpadDirection.set(direction);
		};
	}

	function handleTouchEnd(e: TouchEvent) {
		e.preventDefault();
		dpadDirection.set(null);
	}
</script>

<div class="dpad-container" role="group" aria-label="Directional pad">
	<div class="dpad-row">
		<div class="dpad-spacer"></div>
		<button
			class="dpad-btn"
			aria-label="Up"
			ontouchstart={handleTouchStart('up')}
			ontouchend={handleTouchEnd}
			ontouchcancel={handleTouchEnd}
		>▲</button>
		<div class="dpad-spacer"></div>
	</div>
	<div class="dpad-row">
		<button
			class="dpad-btn"
			aria-label="Left"
			ontouchstart={handleTouchStart('left')}
			ontouchend={handleTouchEnd}
			ontouchcancel={handleTouchEnd}
		>◄</button>
		<div class="dpad-spacer"></div>
		<button
			class="dpad-btn"
			aria-label="Right"
			ontouchstart={handleTouchStart('right')}
			ontouchend={handleTouchEnd}
			ontouchcancel={handleTouchEnd}
		>►</button>
	</div>
	<div class="dpad-row">
		<div class="dpad-spacer"></div>
		<button
			class="dpad-btn"
			aria-label="Down"
			ontouchstart={handleTouchStart('down')}
			ontouchend={handleTouchEnd}
			ontouchcancel={handleTouchEnd}
		>▼</button>
		<div class="dpad-spacer"></div>
	</div>
</div>

<style>
	.dpad-container {
		display: inline-flex;
		flex-direction: column;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.dpad-row {
		display: flex;
		justify-content: center;
	}

	.dpad-spacer {
		width: 48px;
		height: 48px;
	}

	.dpad-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		min-width: 44px;
		min-height: 44px;
		padding: 0;
		margin: 1px;
		border: 2px solid #0f3460;
		border-radius: 6px;
		background-color: #16213e;
		color: #aaaacc;
		font-family: 'MulmaruMono', monospace;
		font-size: 18px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.dpad-btn:active {
		background-color: var(--color-primary);
	}
</style>

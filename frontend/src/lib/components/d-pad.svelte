<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity'
	import { dpadState } from '$lib/stores/dpad.svelte'
	import type { IntentVector } from '@shared/types'

	// Track which buttons are currently pressed via pointer events
	const pressedButtons = new SvelteMap<number, 'up' | 'down' | 'left' | 'right'>()

	function computeIntent(): IntentVector {
		let x: number = 0
		let y: number = 0
		for (const dir of pressedButtons.values()) {
			if (dir === 'left') x -= 1
			else if (dir === 'right') x += 1
			else if (dir === 'up') y -= 1
			else if (dir === 'down') y += 1
		}
		return {
			x: Math.sign(x) as -1 | 0 | 1,
			y: Math.sign(y) as -1 | 0 | 1,
		}
	}

	function handlePointerDown(dir: 'up' | 'down' | 'left' | 'right') {
		return (e: PointerEvent) => {
			e.preventDefault()
			;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
			pressedButtons.set(e.pointerId, dir)
			dpadState.intent = computeIntent()
		}
	}

	function handlePointerUp(e: PointerEvent) {
		e.preventDefault()
		pressedButtons.delete(e.pointerId)
		dpadState.intent = computeIntent()
	}
</script>

<div class="dpad-container" role="group" aria-label="Directional pad">
	<div class="dpad-row">
		<div class="dpad-spacer"></div>
		<button
			class="dpad-btn"
			aria-label="Up"
			onpointerdown={handlePointerDown('up')}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			onpointerleave={handlePointerUp}>▲</button
		>
		<div class="dpad-spacer"></div>
	</div>
	<div class="dpad-row">
		<button
			class="dpad-btn"
			aria-label="Left"
			onpointerdown={handlePointerDown('left')}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			onpointerleave={handlePointerUp}>◄</button
		>
		<div class="dpad-spacer"></div>
		<button
			class="dpad-btn"
			aria-label="Right"
			onpointerdown={handlePointerDown('right')}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			onpointerleave={handlePointerUp}>►</button
		>
	</div>
	<div class="dpad-row">
		<div class="dpad-spacer"></div>
		<button
			class="dpad-btn"
			aria-label="Down"
			onpointerdown={handlePointerDown('down')}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			onpointerleave={handlePointerUp}>▼</button
		>
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

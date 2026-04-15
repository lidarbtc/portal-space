<script lang="ts">
	import { dpadState } from '$lib/stores/dpad.svelte'
	import type { Direction } from '$lib/types'

	const BASE_SIZE = 120
	const MAX_RADIUS = BASE_SIZE / 2
	const DEAD_ZONE = MAX_RADIUS * 0.15

	let thumbX = $state(0)
	let thumbY = $state(0)
	let visible = $state(false)
	let baseX = $state(0)
	let baseY = $state(0)
	let activeTouchId: number | null = $state(null)

	let centerX = 0
	let centerY = 0

	function getDirection(dx: number, dy: number): Direction | null {
		const distance = Math.sqrt(dx * dx + dy * dy)
		if (distance < DEAD_ZONE) return null

		const angle = Math.atan2(dy, dx) * (180 / Math.PI)

		if (angle > -45 && angle <= 45) return 'right'
		if (angle > 45 && angle <= 135) return 'down'
		if (angle > -135 && angle <= -45) return 'up'
		return 'left'
	}

	function handleTouchStart(e: TouchEvent) {
		e.preventDefault()
		e.stopPropagation()

		if (activeTouchId !== null) return

		const touch = e.changedTouches[0]
		activeTouchId = touch.identifier

		const overlay = e.currentTarget as HTMLElement
		const rect = overlay.getBoundingClientRect()
		baseX = touch.clientX - rect.left
		baseY = touch.clientY - rect.top

		centerX = touch.clientX
		centerY = touch.clientY

		visible = true
		thumbX = 0
		thumbY = 0
		dpadState.direction = null
	}

	function handleTouchMove(e: TouchEvent) {
		e.preventDefault()
		e.stopPropagation()

		if (activeTouchId === null) return

		let touch: Touch | null = null
		for (let i = 0; i < e.changedTouches.length; i++) {
			if (e.changedTouches[i].identifier === activeTouchId) {
				touch = e.changedTouches[i]
				break
			}
		}
		if (!touch) return

		const dx = touch.clientX - centerX
		const dy = touch.clientY - centerY
		const distance = Math.sqrt(dx * dx + dy * dy)

		if (distance > MAX_RADIUS) {
			const scale = MAX_RADIUS / distance
			thumbX = dx * scale
			thumbY = dy * scale
		} else {
			thumbX = dx
			thumbY = dy
		}

		dpadState.direction = getDirection(dx, dy)
	}

	function handleTouchEnd(e: TouchEvent) {
		e.preventDefault()
		e.stopPropagation()

		if (activeTouchId === null) return

		let found = false
		for (let i = 0; i < e.changedTouches.length; i++) {
			if (e.changedTouches[i].identifier === activeTouchId) {
				found = true
				break
			}
		}
		if (!found) return

		visible = false
		activeTouchId = null
		thumbX = 0
		thumbY = 0
		dpadState.direction = null
	}
</script>

<div
	class="joystick-overlay"
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	ontouchcancel={handleTouchEnd}
	role="none"
>
	{#if visible}
		<div class="joystick-base" style="left: {baseX}px; top: {baseY}px;">
			<div class="joystick-thumb" style="transform: translate({thumbX}px, {thumbY}px)"></div>
		</div>
	{/if}
</div>

<style>
	.joystick-overlay {
		position: absolute;
		inset: 0;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
		z-index: 60;
	}

	.joystick-base {
		position: absolute;
		transform: translate(-50%, -50%);
		width: 120px;
		height: 120px;
		border-radius: 50%;
		background: rgba(50, 50, 50, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.joystick-base::before {
		content: '';
		position: absolute;
		inset: -16px;
		border-radius: 50%;
		background: conic-gradient(
			from 0deg,
			rgba(220, 220, 220, 0.8) 0deg 40deg,
			transparent 40deg 50deg,
			rgba(220, 220, 220, 0.8) 50deg 130deg,
			transparent 130deg 140deg,
			rgba(220, 220, 220, 0.8) 140deg 220deg,
			transparent 220deg 230deg,
			rgba(220, 220, 220, 0.8) 230deg 310deg,
			transparent 310deg 320deg,
			rgba(220, 220, 220, 0.8) 320deg 360deg
		);
		-webkit-mask: radial-gradient(
			circle,
			transparent calc(50% - 2px),
			black calc(50% - 2px),
			black 50%,
			transparent 50%
		);
		mask: radial-gradient(
			circle,
			transparent calc(50% - 2px),
			black calc(50% - 2px),
			black 50%,
			transparent 50%
		);
	}

	.joystick-thumb {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(220, 220, 220, 0.8);
		pointer-events: none;
	}
</style>

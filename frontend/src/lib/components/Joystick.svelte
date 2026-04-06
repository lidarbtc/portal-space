<script lang="ts">
	import { dpadDirection } from '$lib/stores/dpad';
	import type { Direction } from '$lib/types';

	const BASE_SIZE = 120;
	const THUMB_SIZE = 44;
	const MAX_RADIUS = BASE_SIZE / 2;
	const DEAD_ZONE = MAX_RADIUS * 0.15;

	let thumbX = $state(0);
	let thumbY = $state(0);

	let centerX = 0;
	let centerY = 0;

	function getDirection(dx: number, dy: number): Direction | null {
		const distance = Math.sqrt(dx * dx + dy * dy);
		if (distance < DEAD_ZONE) return null;

		const angle = Math.atan2(dy, dx) * (180 / Math.PI);

		if (angle > -45 && angle <= 45) return 'right';
		if (angle > 45 && angle <= 135) return 'down';
		if (angle > -135 && angle <= -45) return 'up';
		return 'left';
	}

	function handleTouchStart(e: TouchEvent) {
		e.preventDefault();
		e.stopPropagation();

		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		centerX = rect.left + rect.width / 2;
		centerY = rect.top + rect.height / 2;

		const touch = e.touches[0];
		const dx = touch.clientX - centerX;
		const dy = touch.clientY - centerY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > MAX_RADIUS) {
			const scale = MAX_RADIUS / distance;
			thumbX = dx * scale;
			thumbY = dy * scale;
		} else {
			thumbX = dx;
			thumbY = dy;
		}

		dpadDirection.set(getDirection(dx, dy));
	}

	function handleTouchMove(e: TouchEvent) {
		e.preventDefault();
		e.stopPropagation();

		const touch = e.touches[0];
		const dx = touch.clientX - centerX;
		const dy = touch.clientY - centerY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > MAX_RADIUS) {
			const scale = MAX_RADIUS / distance;
			thumbX = dx * scale;
			thumbY = dy * scale;
		} else {
			thumbX = dx;
			thumbY = dy;
		}

		dpadDirection.set(getDirection(dx, dy));
	}

	function handleTouchEnd(e: TouchEvent) {
		e.preventDefault();
		e.stopPropagation();

		thumbX = 0;
		thumbY = 0;
		dpadDirection.set(null);
	}
</script>

<div
	class="joystick-base"
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	ontouchcancel={handleTouchEnd}
	role="none"
>
	<div
		class="joystick-thumb"
		style="transform: translate({thumbX}px, {thumbY}px)"
	></div>
</div>

<style>
	.joystick-base {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		background: rgba(16, 33, 62, 0.6);
		border: 2px solid #0f3460;
		display: flex;
		align-items: center;
		justify-content: center;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.joystick-thumb {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--color-primary);
		pointer-events: none;
	}
</style>

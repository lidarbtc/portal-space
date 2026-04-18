import type { Direction, Facing8, IntentVector } from '@shared/types'

export function angleToDirection8(angleRad: number): Facing8 {
	// Normalize to [-π, π]
	let a = angleRad
	while (a > Math.PI) a -= 2 * Math.PI
	while (a <= -Math.PI) a += 2 * Math.PI

	const deg = (a * 180) / Math.PI
	// 0=right, 90=down (Phaser y increases downward)
	if (deg >= -22.5 && deg < 22.5) return 'right'
	if (deg >= 22.5 && deg < 67.5) return 'down-right'
	if (deg >= 67.5 && deg < 112.5) return 'down'
	if (deg >= 112.5 && deg < 157.5) return 'down-left'
	if (deg >= 157.5 || deg < -157.5) return 'left'
	if (deg >= -157.5 && deg < -112.5) return 'up-left'
	if (deg >= -112.5 && deg < -67.5) return 'up'
	return 'up-right'
}

export function intentToDirection4(intent: IntentVector, prev: Direction | null): Direction {
	if (intent.x === 0 && intent.y === 0) {
		return prev ?? 'down'
	}

	if (prev !== null) {
		// Check if prev is consistent with intent cardinal components
		if (intent.x !== 0 && intent.y !== 0) {
			// Diagonal intent: check if prev matches either axis
			const xDir: Direction = intent.x > 0 ? 'right' : 'left'
			const yDir: Direction = intent.y > 0 ? 'down' : 'up'
			if (prev === xDir || prev === yDir) return prev
			// prev not in intent: X-axis fallback
			return xDir
		} else if (intent.x !== 0) {
			return intent.x > 0 ? 'right' : 'left'
		} else {
			return intent.y > 0 ? 'down' : 'up'
		}
	}

	// No prev: X-axis priority
	if (intent.x !== 0) return intent.x > 0 ? 'right' : 'left'
	return intent.y > 0 ? 'down' : 'up'
}

export function intentToFacing8(intent: IntentVector): Facing8 | null {
	if (intent.x === 0 && intent.y === 0) return null
	if (intent.x === 1 && intent.y === 0) return 'right'
	if (intent.x === -1 && intent.y === 0) return 'left'
	if (intent.x === 0 && intent.y === -1) return 'up'
	if (intent.x === 0 && intent.y === 1) return 'down'
	if (intent.x === 1 && intent.y === -1) return 'up-right'
	if (intent.x === -1 && intent.y === -1) return 'up-left'
	if (intent.x === 1 && intent.y === 1) return 'down-right'
	return 'down-left'
}

export function directionToFrame(dir: Direction): number {
	const dirFrame: Record<Direction, number> = {
		down: 0,
		up: 1,
		right: 2,
		left: 3,
	}
	return dirFrame[dir] ?? 0
}

// 8프레임 스프라이트시트용 — Phaser 좌표계 (0°=right, 90°=down) 기준 시계방향.
// 프레임 레이아웃: [right, down-right, down, down-left, left, up-left, up, up-right]
export function facing8ToFrame(f8: Facing8): number {
	const f8Frame: Record<Facing8, number> = {
		right: 0,
		'down-right': 1,
		down: 2,
		'down-left': 3,
		left: 4,
		'up-left': 5,
		up: 6,
		'up-right': 7,
	}
	return f8Frame[f8]
}

export function facing8ToDirection4(f8: Facing8): Direction {
	switch (f8) {
		case 'up':
			return 'up'
		case 'down':
			return 'down'
		case 'left':
			return 'left'
		case 'right':
			return 'right'
		case 'up-left':
			return 'left'
		case 'up-right':
			return 'right'
		case 'down-left':
			return 'left'
		case 'down-right':
			return 'right'
	}
}

export function isFacing8ConsistentWithDir(f8: Facing8, dir: Direction): boolean {
	switch (f8) {
		case 'up':
			return dir === 'up'
		case 'down':
			return dir === 'down'
		case 'left':
			return dir === 'left'
		case 'right':
			return dir === 'right'
		case 'up-left':
			return dir === 'up' || dir === 'left'
		case 'up-right':
			return dir === 'up' || dir === 'right'
		case 'down-left':
			return dir === 'down' || dir === 'left'
		case 'down-right':
			return dir === 'down' || dir === 'right'
	}
}

export function derivedFacing8FromDir(dir: Direction): Facing8 {
	return dir
}

const DIAG = 1 / Math.SQRT2

export function directionToVector(f8: Facing8): { x: number; y: number } {
	switch (f8) {
		case 'right':
			return { x: 1, y: 0 }
		case 'left':
			return { x: -1, y: 0 }
		case 'up':
			return { x: 0, y: -1 }
		case 'down':
			return { x: 0, y: 1 }
		case 'up-right':
			return { x: DIAG, y: -DIAG }
		case 'up-left':
			return { x: -DIAG, y: -DIAG }
		case 'down-right':
			return { x: DIAG, y: DIAG }
		case 'down-left':
			return { x: -DIAG, y: DIAG }
	}
}

import { describe, it, expect } from 'vitest'
import {
	intentToFacing8,
	isFacing8ConsistentWithDir,
	intentToDirection4,
	directionToVector,
} from './direction'
import type { Facing8 } from '@shared/types'

describe('intentToFacing8', () => {
	it('(0,0) → null', () => {
		expect(intentToFacing8({ x: 0, y: 0 })).toBeNull()
	})
	it('(1,0) → right', () => {
		expect(intentToFacing8({ x: 1, y: 0 })).toBe('right')
	})
	it('(-1,0) → left', () => {
		expect(intentToFacing8({ x: -1, y: 0 })).toBe('left')
	})
	it('(0,-1) → up', () => {
		expect(intentToFacing8({ x: 0, y: -1 })).toBe('up')
	})
	it('(0,1) → down', () => {
		expect(intentToFacing8({ x: 0, y: 1 })).toBe('down')
	})
	it('(1,-1) → up-right', () => {
		expect(intentToFacing8({ x: 1, y: -1 })).toBe('up-right')
	})
	it('(-1,-1) → up-left', () => {
		expect(intentToFacing8({ x: -1, y: -1 })).toBe('up-left')
	})
	it('(1,1) → down-right', () => {
		expect(intentToFacing8({ x: 1, y: 1 })).toBe('down-right')
	})
	it('(-1,1) → down-left', () => {
		expect(intentToFacing8({ x: -1, y: 1 })).toBe('down-left')
	})
})

describe('isFacing8ConsistentWithDir', () => {
	it("('up-right','up') → true", () => {
		expect(isFacing8ConsistentWithDir('up-right', 'up')).toBe(true)
	})
	it("('up-right','right') → true", () => {
		expect(isFacing8ConsistentWithDir('up-right', 'right')).toBe(true)
	})
	it("('up-right','down') → false", () => {
		expect(isFacing8ConsistentWithDir('up-right', 'down')).toBe(false)
	})
	it("('up','up') → true", () => {
		expect(isFacing8ConsistentWithDir('up', 'up')).toBe(true)
	})
	it("('up','right') → false", () => {
		expect(isFacing8ConsistentWithDir('up', 'right')).toBe(false)
	})
	it("('down-left','left') → true", () => {
		expect(isFacing8ConsistentWithDir('down-left', 'left')).toBe(true)
	})
	it("('down-left','right') → false", () => {
		expect(isFacing8ConsistentWithDir('down-left', 'right')).toBe(false)
	})
})

describe('intentToDirection4', () => {
	it('prev=null, (1,0) → right', () => {
		expect(intentToDirection4({ x: 1, y: 0 }, null)).toBe('right')
	})
	it('prev=null, (1,-1) → right (X축 우선)', () => {
		expect(intentToDirection4({ x: 1, y: -1 }, null)).toBe('right')
	})
	it("prev='left', (1,0) → right", () => {
		expect(intentToDirection4({ x: 1, y: 0 }, 'left')).toBe('right')
	})
	it("prev='down', (1,1) → down (prev∈intent)", () => {
		expect(intentToDirection4({ x: 1, y: 1 }, 'down')).toBe('down')
	})
	it("prev='right', (1,1) → right (prev∈intent)", () => {
		expect(intentToDirection4({ x: 1, y: 1 }, 'right')).toBe('right')
	})
	it("prev='right', (-1,1) → left (prev∉intent → X축)", () => {
		expect(intentToDirection4({ x: -1, y: 1 }, 'right')).toBe('left')
	})
	it("prev='down', (-1,-1) → left (양축 미포함 → X축 우선)", () => {
		expect(intentToDirection4({ x: -1, y: -1 }, 'down')).toBe('left')
	})
	it("prev='up', (0,0) → up (정지 prev 유지)", () => {
		expect(intentToDirection4({ x: 0, y: 0 }, 'up')).toBe('up')
	})
})

describe('directionToVector', () => {
	const ALL_F8: Facing8[] = [
		'up',
		'down',
		'left',
		'right',
		'up-left',
		'up-right',
		'down-left',
		'down-right',
	]
	it('모든 facing8에 대해 |v| ≈ 1', () => {
		for (const f8 of ALL_F8) {
			const v = directionToVector(f8)
			const mag = Math.sqrt(v.x * v.x + v.y * v.y)
			expect(Math.abs(mag - 1)).toBeLessThan(1e-9)
		}
	})
	it("'up' → (0,-1)", () => {
		expect(directionToVector('up')).toEqual({ x: 0, y: -1 })
	})
	it("'down-right' → x>0, y>0, |v|≈1", () => {
		const v = directionToVector('down-right')
		expect(v.x).toBeGreaterThan(0)
		expect(v.y).toBeGreaterThan(0)
		expect(Math.abs(Math.sqrt(v.x * v.x + v.y * v.y) - 1)).toBeLessThan(1e-9)
	})
})

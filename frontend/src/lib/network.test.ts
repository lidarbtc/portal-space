import { describe, it, expect, vi } from 'vitest'
import { Effect, Schedule, Duration, Fiber } from 'effect'
import { WebSocketError, ConnectionTimeoutError } from './errors'

/**
 * Tests for Effect-based retry logic used in network.ts.
 * These test the retry/schedule/fiber patterns in isolation,
 * covering the same 5 scenarios as the deleted retry.test.ts.
 *
 * Uses real timers with very short durations — Effect's internal
 * scheduler does not work with vi.useFakeTimers().
 */

describe('Effect retry with Schedule (network reconnection pattern)', () => {
	it('resolves immediately on first success', async () => {
		const fn = vi.fn().mockResolvedValue('snapshot')
		const effect = Effect.tryPromise({
			try: () => fn(),
			catch: () => new WebSocketError(),
		})

		const result = await Effect.runPromise(effect)
		expect(result).toBe('snapshot')
		expect(fn).toHaveBeenCalledTimes(1)
	})

	it('retries and succeeds on Nth attempt', async () => {
		let attempt = 0
		const effect = Effect.tryPromise({
			try: () => {
				attempt++
				if (attempt < 3) return Promise.reject(new Error('fail'))
				return Promise.resolve('ok')
			},
			catch: () => new WebSocketError(),
		})

		const retrySchedule = Schedule.recurs(5).pipe(
			Schedule.intersect(Schedule.spaced(Duration.millis(1))),
		)

		const retried = effect.pipe(Effect.retry(retrySchedule))
		const result = await Effect.runPromise(retried)
		expect(result).toBe('ok')
		expect(attempt).toBe(3)
	})

	it('fails after schedule exhaustion (max retries)', async () => {
		const fn = vi.fn().mockRejectedValue(new Error('always fail'))
		const effect = Effect.tryPromise({
			try: () => fn(),
			catch: () => new WebSocketError('always fail'),
		})

		const retrySchedule = Schedule.recurs(3).pipe(
			Schedule.intersect(Schedule.spaced(Duration.millis(1))),
		)

		const retried = effect.pipe(Effect.retry(retrySchedule))
		const result = await Effect.runPromiseExit(retried)

		expect(result._tag).toBe('Failure')
		// 1 initial + 3 retries = 4 total
		expect(fn).toHaveBeenCalledTimes(4)
	})

	it('stops retrying after fiber interrupt (cancel semantics)', async () => {
		let attempts = 0
		const effect = Effect.tryPromise({
			try: () => {
				attempts++
				return Promise.reject(new Error('fail'))
			},
			catch: () => new WebSocketError(),
		})

		const retrySchedule = Schedule.forever.pipe(
			Schedule.intersect(Schedule.spaced(Duration.millis(10))),
		)

		const retried = effect.pipe(Effect.retry(retrySchedule))
		const fiber = Effect.runFork(retried)

		// Let a few attempts run
		await new Promise((r) => setTimeout(r, 80))
		const attemptsBeforeCancel = attempts
		expect(attemptsBeforeCancel).toBeGreaterThan(1)

		// Interrupt the fiber (simulates disconnect() calling Fiber.interrupt)
		await Effect.runPromise(Fiber.interrupt(fiber))

		// Wait and verify no more attempts
		await new Promise((r) => setTimeout(r, 80))
		expect(attempts).toBe(attemptsBeforeCancel)
	})

	it('exponential schedule produces increasing delays', async () => {
		// Verify the schedule pattern directly — delays should increase
		const schedule = Schedule.exponential(Duration.millis(10)).pipe(
			Schedule.jittered,
			Schedule.union(Schedule.spaced(Duration.millis(160))),
		)

		// Collect delays produced by the schedule
		const delays: number[] = []
		let lastTime = Date.now()

		let attempt = 0
		const effect = Effect.tryPromise({
			try: () => {
				const now = Date.now()
				if (attempt > 0) delays.push(now - lastTime)
				lastTime = now
				attempt++
				if (attempt <= 4) return Promise.reject(new Error('fail'))
				return Promise.resolve('ok')
			},
			catch: () => new WebSocketError(),
		})

		const retried = effect.pipe(
			Effect.retry(schedule.pipe(Schedule.intersect(Schedule.recurs(10)))),
		)
		await Effect.runPromise(retried)

		expect(attempt).toBe(5)
		expect(delays.length).toBe(4)
		// General trend: later delays should be larger than earlier ones
		// (jitter adds variance, so check average of last 2 > average of first 2)
		const earlyAvg = (delays[0] + delays[1]) / 2
		const lateAvg = (delays[2] + delays[3]) / 2
		expect(lateAvg).toBeGreaterThanOrEqual(earlyAvg)
	})
})

describe('Network error types', () => {
	it('WebSocketError has correct tag', () => {
		const err = new WebSocketError('connection failed')
		expect(err._tag).toBe('WebSocketError')
		expect(err.message).toBe('connection failed')
	})

	it('ConnectionTimeoutError has correct tag', () => {
		const err = new ConnectionTimeoutError(5000)
		expect(err._tag).toBe('ConnectionTimeoutError')
		expect(err.timeoutMs).toBe(5000)
	})
})

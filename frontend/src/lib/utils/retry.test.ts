import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { retryWithBackoff } from './retry'

describe('retryWithBackoff', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.spyOn(Math, 'random').mockReturnValue(0.5)
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it('resolves immediately on first success', async () => {
		const fn = vi.fn().mockResolvedValue('ok')
		const { promise } = retryWithBackoff(fn, {
			baseDelay: 1000,
			maxDelay: 16000,
			maxElapsed: 60000,
		})

		const result = await promise
		expect(result).toBe('ok')
		expect(fn).toHaveBeenCalledTimes(1)
	})

	it('retries and succeeds on Nth attempt', async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error('fail 1'))
			.mockRejectedValueOnce(new Error('fail 2'))
			.mockResolvedValue('ok')

		const { promise } = retryWithBackoff(fn, {
			baseDelay: 1000,
			maxDelay: 16000,
			maxElapsed: 60000,
		})

		// Advance past first retry delay: 0.5 * 1000 = 500ms
		await vi.advanceTimersByTimeAsync(500)
		// Advance past second retry delay: 0.5 * 2000 = 1000ms
		await vi.advanceTimersByTimeAsync(1000)

		const result = await promise
		expect(result).toBe('ok')
		expect(fn).toHaveBeenCalledTimes(3)
	})

	it('rejects after maxElapsed timeout', async () => {
		const fn = vi.fn().mockRejectedValue(new Error('always fail'))

		const { promise, cancel } = retryWithBackoff(fn, {
			baseDelay: 100,
			maxDelay: 1000,
			maxElapsed: 500,
		})

		// Gradually advance time until the promise settles
		const result = Promise.allSettled([promise])
		for (let i = 0; i < 20; i++) {
			await vi.advanceTimersByTimeAsync(100)
		}

		const [settled] = await result
		expect(settled.status).toBe('rejected')
		if (settled.status === 'rejected') {
			expect(settled.reason.message).toContain('Retry timeout')
		}

		// Cancel and clear any remaining pending timers
		cancel()
		vi.clearAllTimers()
	})

	it('stops retrying after cancel', async () => {
		const fn = vi.fn().mockRejectedValue(new Error('fail'))

		const { cancel } = retryWithBackoff(fn, {
			baseDelay: 1000,
			maxDelay: 16000,
			maxElapsed: 60000,
		})

		// First attempt fails immediately, retry scheduled
		await vi.advanceTimersByTimeAsync(1)
		// Fire the retry timer — second attempt runs and fails, another retry scheduled
		await vi.advanceTimersByTimeAsync(500) // 0.5 * 1000
		expect(fn).toHaveBeenCalledTimes(2)

		// Cancel now — clears the pending timer for 3rd attempt
		cancel()
		// Advance time — no more calls should happen
		await vi.advanceTimersByTimeAsync(10000)
		expect(fn).toHaveBeenCalledTimes(2)
	})

	it('respects maxDelay cap on exponential backoff', async () => {
		let attempt = 0
		const fn = vi.fn().mockImplementation(() => {
			attempt++
			if (attempt < 10) return Promise.reject(new Error('fail'))
			return Promise.resolve('ok')
		})

		const { promise } = retryWithBackoff(fn, {
			baseDelay: 100,
			maxDelay: 500,
			maxElapsed: 60000,
		})

		// Advance enough time for all retries
		for (let i = 0; i < 30; i++) {
			await vi.advanceTimersByTimeAsync(500)
		}

		const result = await promise
		expect(result).toBe('ok')
	})
})

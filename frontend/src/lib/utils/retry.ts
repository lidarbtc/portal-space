export interface RetryOptions {
	baseDelay: number
	maxDelay: number
	maxElapsed: number
}

/**
 * Retry an async function with exponential backoff and full jitter.
 * Each retry calls fn() fresh. Rejects when maxElapsed is exceeded.
 */
export function retryWithBackoff<T>(
	fn: () => Promise<T>,
	opts: RetryOptions,
): { promise: Promise<T>; cancel: () => void } {
	let cancelled = false
	let timeoutId: ReturnType<typeof setTimeout> | undefined

	const cancel = () => {
		cancelled = true
		if (timeoutId !== undefined) clearTimeout(timeoutId)
	}

	const promise = new Promise<T>((resolve, reject) => {
		const startTime = Date.now()
		let attempt = 0

		const tryOnce = async () => {
			if (cancelled) {
				reject(new Error('Retry cancelled'))
				return
			}

			const elapsed = Date.now() - startTime
			if (elapsed >= opts.maxElapsed) {
				reject(new Error(`Retry timeout after ${elapsed}ms`))
				return
			}

			try {
				const result = await fn()
				if (!cancelled) resolve(result)
			} catch {
				if (cancelled) {
					reject(new Error('Retry cancelled'))
					return
				}

				const elapsed = Date.now() - startTime
				if (elapsed >= opts.maxElapsed) {
					reject(new Error(`Retry timeout after ${elapsed}ms`))
					return
				}

				// Full jitter: random between 0 and min(baseDelay * 2^attempt, maxDelay)
				const exponentialDelay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay)
				const delay = Math.random() * exponentialDelay
				attempt++

				timeoutId = setTimeout(tryOnce, delay)
			}
		}

		// First attempt immediately
		tryOnce()
	})

	return { promise, cancel }
}

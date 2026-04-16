export interface TextSegment {
	type: 'text' | 'url' | 'mention'
	value: string
}

// Matches http:// or https:// followed by non-whitespace characters
const URL_REGEX = /https?:\/\/[^\s<>]+/g

/**
 * Strip trailing punctuation from a URL match, with balanced parenthesis handling.
 * Returns [url, trailing] where trailing is the stripped suffix.
 */
function trimTrailing(raw: string): [string, string] {
	let url = raw
	let trailing = ''

	// Iteratively strip trailing punctuation, respecting balanced parens
	while (url.length > 0) {
		const last = url[url.length - 1]

		// Handle closing paren: only strip if unbalanced
		if (last === ')') {
			const opens = (url.match(/\(/g) || []).length
			const closes = (url.match(/\)/g) || []).length
			if (closes > opens) {
				trailing = last + trailing
				url = url.slice(0, -1)
				continue
			}
			break
		}

		// Strip other trailing punctuation
		if (/[.,;:!?\]'"}>]/.test(last)) {
			trailing = last + trailing
			url = url.slice(0, -1)
			continue
		}

		break
	}

	return [url, trailing]
}

/**
 * Parse text into segments of plain text and URLs.
 * Only matches http:// and https:// schemes.
 */
export function parseTextWithUrls(text: string): TextSegment[] {
	const segments: TextSegment[] = []
	let lastIndex = 0

	// Reset regex state
	URL_REGEX.lastIndex = 0

	let match: RegExpExecArray | null
	while ((match = URL_REGEX.exec(text)) !== null) {
		const rawUrl = match[0]
		const matchStart = match.index

		// Must have a host after the scheme (reject bare "http://")
		const schemeEnd = rawUrl.indexOf('://') + 3
		if (schemeEnd >= rawUrl.length) {
			continue
		}

		const [url] = trimTrailing(rawUrl)

		// Add preceding text
		if (matchStart > lastIndex) {
			segments.push({ type: 'text', value: text.slice(lastIndex, matchStart) })
		}

		// Add URL segment
		segments.push({ type: 'url', value: url })

		// Adjust lastIndex: consume url + trailing (trailing becomes part of next text)
		lastIndex = matchStart + url.length

		// Backtrack the regex to account for stripped trailing chars
		URL_REGEX.lastIndex = lastIndex
	}

	// Add remaining text
	if (lastIndex < text.length) {
		segments.push({ type: 'text', value: text.slice(lastIndex) })
	}

	return segments
}

/**
 * Resolve @mentions in plain text against a list of known nicknames.
 * Uses greedy longest-match: nicknames sorted by length descending,
 * so "Kim Yechan" (11 chars) matches before "Kim" (3 chars).
 */
export function resolveMentions(text: string, knownNicknames: string[]): TextSegment[] {
	if (knownNicknames.length === 0 || !text.includes('@')) {
		return [{ type: 'text', value: text }]
	}

	// Sort by length descending for greedy longest-match
	const sorted = [...knownNicknames].sort((a, b) => b.length - a.length)
	const segments: TextSegment[] = []
	let i = 0
	let textBuf = ''

	function flushText() {
		if (textBuf) {
			segments.push({ type: 'text', value: textBuf })
			textBuf = ''
		}
	}

	while (i < text.length) {
		if (text[i] !== '@') {
			textBuf += text[i]
			i++
			continue
		}

		// @ found — check if preceded by start or whitespace
		if (i > 0 && text[i - 1] !== ' ' && text[i - 1] !== '\n' && text[i - 1] !== '\t') {
			textBuf += text[i]
			i++
			continue
		}

		// Try to match a known nickname after @
		const afterAt = text.slice(i + 1)
		let matched = false
		for (const nick of sorted) {
			if (afterAt.length < nick.length) continue
			const candidate = afterAt.slice(0, nick.length)
			if (candidate.toLowerCase() === nick.toLowerCase()) {
				// Check that mention ends at word boundary (end of string, space, or punctuation)
				const charAfter = afterAt[nick.length]
				if (
					charAfter !== undefined &&
					charAfter !== ' ' &&
					charAfter !== '\n' &&
					charAfter !== '\t' &&
					!/[.,;:!?)]/.test(charAfter)
				) {
					continue
				}
				flushText()
				segments.push({ type: 'mention', value: '@' + candidate })
				i += 1 + nick.length
				matched = true
				break
			}
		}

		if (!matched) {
			textBuf += text[i]
			i++
		}
	}

	flushText()

	return segments
}

/**
 * Parse text into segments of plain text, URLs, and @mentions.
 * 2-phase: (1) URL parsing via parseTextWithUrls, (2) mention resolution on text segments.
 * Pure function — knownNicknames must be passed in, no reactive store dependency.
 */
export function parseTextSegments(text: string, knownNicknames: string[]): TextSegment[] {
	// Phase 1: URL parsing
	const urlSegments = parseTextWithUrls(text)

	if (knownNicknames.length === 0) return urlSegments

	// Phase 2: Resolve mentions in text segments only (URL segments pass through)
	const result: TextSegment[] = []
	for (const seg of urlSegments) {
		if (seg.type !== 'text') {
			result.push(seg)
			continue
		}
		const mentionSegments = resolveMentions(seg.value, knownNicknames)
		result.push(...mentionSegments)
	}

	return result
}

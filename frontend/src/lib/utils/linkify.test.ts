import { describe, it, expect } from 'vitest'
import { parseTextWithUrls } from './linkify'

describe('parseTextWithUrls', () => {
	it('returns plain text when no URLs present', () => {
		expect(parseTextWithUrls('hello world')).toEqual([{ type: 'text', value: 'hello world' }])
	})

	it('returns empty array for empty string', () => {
		expect(parseTextWithUrls('')).toEqual([])
	})

	it('parses a single URL', () => {
		expect(parseTextWithUrls('https://example.com')).toEqual([
			{ type: 'url', value: 'https://example.com' },
		])
	})

	it('parses URL with surrounding text', () => {
		expect(parseTextWithUrls('visit https://example.com now')).toEqual([
			{ type: 'text', value: 'visit ' },
			{ type: 'url', value: 'https://example.com' },
			{ type: 'text', value: ' now' },
		])
	})

	it('parses multiple URLs', () => {
		const result = parseTextWithUrls('see https://a.com and http://b.com end')
		expect(result).toEqual([
			{ type: 'text', value: 'see ' },
			{ type: 'url', value: 'https://a.com' },
			{ type: 'text', value: ' and ' },
			{ type: 'url', value: 'http://b.com' },
			{ type: 'text', value: ' end' },
		])
	})

	it('strips trailing punctuation from URLs', () => {
		const result = parseTextWithUrls('check https://example.com.')
		expect(result).toEqual([
			{ type: 'text', value: 'check ' },
			{ type: 'url', value: 'https://example.com' },
			{ type: 'text', value: '.' },
		])
	})

	it('strips trailing comma and semicolon', () => {
		const result = parseTextWithUrls('https://a.com, https://b.com;')
		expect(result).toEqual([
			{ type: 'url', value: 'https://a.com' },
			{ type: 'text', value: ', ' },
			{ type: 'url', value: 'https://b.com' },
			{ type: 'text', value: ';' },
		])
	})

	it('preserves balanced parentheses in URLs (Wikipedia)', () => {
		const url = 'https://en.wikipedia.org/wiki/Foo_(bar)'
		expect(parseTextWithUrls(url)).toEqual([{ type: 'url', value: url }])
	})

	it('strips unbalanced closing paren', () => {
		const result = parseTextWithUrls('(https://example.com)')
		expect(result).toEqual([
			{ type: 'text', value: '(' },
			{ type: 'url', value: 'https://example.com' },
			{ type: 'text', value: ')' },
		])
	})

	it('rejects bare scheme without host', () => {
		expect(parseTextWithUrls('http://')).toEqual([{ type: 'text', value: 'http://' }])
	})

	it('handles consecutive calls correctly (regex state reset)', () => {
		parseTextWithUrls('https://first.com')
		const result = parseTextWithUrls('https://second.com')
		expect(result).toEqual([{ type: 'url', value: 'https://second.com' }])
	})
})

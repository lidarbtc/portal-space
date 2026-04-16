import { describe, it, expect } from 'vitest'
import { parseOutgoingMessage } from './messages'

describe('parseOutgoingMessage', () => {
	it('decodes a snapshot message', () => {
		const raw = {
			type: 'snapshot',
			x: 0,
			y: 0,
			players: [
				{
					id: 'p1',
					nickname: 'alice',
					x: 100,
					y: 200,
					status: 'online',
					dir: 'down',
					avatar: 0,
				},
			],
			self: {
				id: 'p1',
				nickname: 'alice',
				x: 100,
				y: 200,
				status: 'online',
				dir: 'down',
				avatar: 0,
			},
			objects: [],
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
		if (result._tag === 'ok') {
			expect(result.message.type).toBe('snapshot')
		}
	})

	it('decodes a join message', () => {
		const raw = {
			type: 'join',
			id: 'p2',
			nickname: 'bob',
			x: 50,
			y: 60,
			dir: 'up',
			status: 'online',
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
		if (result._tag === 'ok') {
			expect(result.message.type).toBe('join')
		}
	})

	it('decodes a leave message', () => {
		const raw = { type: 'leave', id: 'p2', x: 0, y: 0 }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes a move message', () => {
		const raw = { type: 'move', id: 'p1', x: 120, y: 300, dir: 'right' }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
		if (result._tag === 'ok') {
			expect(result.message.type).toBe('move')
		}
	})

	it('decodes a dash message', () => {
		const raw = { type: 'dash', id: 'p1', x: 150, y: 200, dir: 'left' }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes a status message', () => {
		const raw = { type: 'status', id: 'p1', x: 0, y: 0, status: 'away' }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes a chat message with text', () => {
		const raw = {
			type: 'chat',
			id: 'p1',
			nickname: 'alice',
			x: 0,
			y: 0,
			text: 'hello world',
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes a chat message with image', () => {
		const raw = {
			type: 'chat',
			id: 'p1',
			nickname: 'alice',
			x: 0,
			y: 0,
			image: { mime: 'image/png', data: 'abc123', size: 1024 },
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes a system chat message', () => {
		const raw = {
			type: 'chat',
			x: 0,
			y: 0,
			text: '서버에 접속했습니다.',
			isSystem: true,
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes an emote message', () => {
		const raw = { type: 'emote', id: 'p1', x: 0, y: 0, emoji: '🔥' }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes a profile message', () => {
		const raw = {
			type: 'profile',
			id: 'p1',
			x: 0,
			y: 0,
			nickname: 'new_name',
			colors: { body: '#ff0000', eye: '#00ff00', foot: '#0000ff' },
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes a customStatus message', () => {
		const raw = { type: 'customStatus', id: 'p1', x: 0, y: 0, customStatus: '회의 중' }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes an error message', () => {
		const raw = { type: 'error', x: 0, y: 0, message: '닉네임이 이미 사용 중입니다.' }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
		if (result._tag === 'ok') {
			expect(result.message.type).toBe('error')
		}
	})

	it('decodes an action message', () => {
		const raw = {
			type: 'action',
			x: 0,
			y: 0,
			actionPayload: {
				domain: 'regional_chat',
				action: 'update_settings',
				objectId: 'zone1',
			},
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	it('decodes an action message with zone events', () => {
		const raw = {
			type: 'action',
			x: 0,
			y: 0,
			zoneId: 'zone1',
			zoneName: 'Lobby',
			zoneEvent: 'enter',
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('ok')
	})

	// --- Failure cases ---

	it('returns error for invalid message type', () => {
		const raw = { type: 'unknown_type', x: 0, y: 0 }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('error')
		if (result._tag === 'error') {
			expect(result.error._tag).toBe('MessageDecodeError')
		}
	})

	it('returns error for missing type field', () => {
		const raw = { x: 100, y: 200, nickname: 'alice' }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('error')
	})

	it('returns error for non-object input', () => {
		const result = parseOutgoingMessage('not an object')
		expect(result._tag).toBe('error')
	})

	it('returns error for null input', () => {
		const result = parseOutgoingMessage(null)
		expect(result._tag).toBe('error')
	})

	it('returns error for invalid player status in snapshot', () => {
		const raw = {
			type: 'snapshot',
			x: 0,
			y: 0,
			players: [
				{
					id: 'p1',
					nickname: 'alice',
					x: 0,
					y: 0,
					status: 'invalid_status',
					dir: 'down',
					avatar: 0,
				},
			],
		}
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('error')
	})

	it('returns error for invalid emoji', () => {
		const raw = { type: 'emote', id: 'p1', x: 0, y: 0, emoji: '😀' }
		const result = parseOutgoingMessage(raw)
		expect(result._tag).toBe('error')
	})
})

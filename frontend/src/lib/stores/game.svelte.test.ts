import { describe, it, expect, beforeEach } from 'vitest'
import { GameStore } from './game.svelte'

describe('GameStore', () => {
	let store: GameStore

	beforeEach(() => {
		store = new GameStore()
	})

	it('starts with empty state', () => {
		expect(store.chatMessages).toEqual([])
		expect(store.selfId).toBeNull()
		expect(store.playerCount).toBe(0)
		expect(store.currentStatus).toBe('online')
	})

	it('adds a chat message', () => {
		store.addChatMessage({ nickname: 'alice', text: 'hello' })

		expect(store.chatMessages).toHaveLength(1)
		expect(store.chatMessages[0].nickname).toBe('alice')
		expect(store.chatMessages[0].text).toBe('hello')
		expect(store.chatMessages[0].isSystem).toBe(false)
	})

	it('ignores chat message with no text and no image', () => {
		store.addChatMessage({ nickname: 'alice' })

		expect(store.chatMessages).toHaveLength(0)
	})

	it('adds a system message', () => {
		store.addSystemMessage('서버에 접속했습니다.')

		expect(store.chatMessages).toHaveLength(1)
		expect(store.chatMessages[0].text).toBe('서버에 접속했습니다.')
		expect(store.chatMessages[0].isSystem).toBe(true)
	})

	it('truncates chat messages to MAX_CHAT_MESSAGES (50)', () => {
		// Add 55 messages
		for (let i = 0; i < 55; i++) {
			store.addChatMessage({ nickname: 'bot', text: `msg ${i}` })
		}

		expect(store.chatMessages).toHaveLength(50)
		// Should keep the latest 50, so first message should be msg 5
		expect(store.chatMessages[0].text).toBe('msg 5')
		expect(store.chatMessages[49].text).toBe('msg 54')
	})

	it('tracks player count via SvelteMap', () => {
		expect(store.playerCount).toBe(0)

		store.players.set('p1', {
			id: 'p1',
			nickname: 'alice',
			x: 0,
			y: 0,
			status: 'online',
			dir: 'down',
			avatar: 0,
		})

		expect(store.playerCount).toBe(1)

		store.players.set('p2', {
			id: 'p2',
			nickname: 'bob',
			x: 10,
			y: 10,
			status: 'online',
			dir: 'up',
			avatar: 1,
		})

		expect(store.playerCount).toBe(2)

		store.players.delete('p1')
		expect(store.playerCount).toBe(1)
	})
})

import { writable, derived } from 'svelte/store';
import type { PlayerInfo, PlayerStatus, ChatMessage } from '$lib/types';

// Players map: id -> PlayerInfo
export const players = writable<Map<string, PlayerInfo>>(new Map());

// Local player ID
export const selfId = writable<string | null>(null);

// Derived player count
export const playerCount = derived(players, ($players) => $players.size);

// Chat messages (FIFO, max 50)
const MAX_CHAT_MESSAGES = 50;
export const chatMessages = writable<ChatMessage[]>([]);

export function addChatMessage(nickname: string, text: string): void {
  chatMessages.update((msgs) => {
    const updated = [...msgs, { nickname, text, isSystem: false, timestamp: Date.now() }];
    if (updated.length > MAX_CHAT_MESSAGES) {
      return updated.slice(updated.length - MAX_CHAT_MESSAGES);
    }
    return updated;
  });
}

export function addSystemMessage(text: string): void {
  chatMessages.update((msgs) => {
    const updated = [...msgs, { text, isSystem: true, timestamp: Date.now() }];
    if (updated.length > MAX_CHAT_MESSAGES) {
      return updated.slice(updated.length - MAX_CHAT_MESSAGES);
    }
    return updated;
  });
}

// Current status
export const currentStatus = writable<PlayerStatus>('online');

// Chat input active state
export const chatInputActive = writable(false);

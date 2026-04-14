import { writable } from 'svelte/store';
import type { ChatMessage, ChatChannel, ChatImage } from '$lib/types';

const MAX_REGIONAL_MESSAGES = 50;

// Which zone the local player is in
export const currentZoneId = writable<string | null>(null);
export const currentZoneName = writable<string | null>(null);

// Active chat tab
export const activeChatTab = writable<ChatChannel>('global');

// Zone-specific messages (FIFO, max 50)
export const regionalMessages = writable<ChatMessage[]>([]);

// Settings panel state
export const regionalChatSettingsOpen = writable(false);
export const currentRegionalChatId = writable<string | null>(null);

export function addRegionalMessage({
  senderId,
  nickname,
  nicknameColor,
  text,
  image,
  isSystem = false,
}: {
  senderId?: string;
  nickname?: string;
  nicknameColor?: string;
  text?: string;
  image?: ChatImage;
  isSystem?: boolean;
}): void {
  if (!text && !image) return;

  regionalMessages.update((msgs) => {
    const updated = [
      ...msgs,
      { senderId, nickname, nicknameColor, text, image, isSystem, timestamp: Date.now(), channel: 'regional' as ChatChannel },
    ];
    if (updated.length > MAX_REGIONAL_MESSAGES) {
      return updated.slice(updated.length - MAX_REGIONAL_MESSAGES);
    }
    return updated;
  });
}

export function enterZone(zoneId: string, zoneName: string): void {
  currentZoneId.set(zoneId);
  currentZoneName.set(zoneName);
  activeChatTab.set('regional');
}

export function exitZone(): void {
  currentZoneId.set(null);
  currentZoneName.set(null);
  regionalMessages.set([]);
  activeChatTab.set('global');
}

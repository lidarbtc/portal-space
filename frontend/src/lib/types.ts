// Message types — must match protocol.go MsgType constants
export type MsgType = 'join' | 'leave' | 'move' | 'status' | 'chat' | 'emote' | 'profile' | 'snapshot' | 'error';

export type Direction = 'up' | 'down' | 'left' | 'right';
export type PlayerStatus = 'online' | 'away' | 'dnd';
export type Emoji = '👋' | '☕' | '🔥' | '💻' | '📢';

export interface ColorPalette {
  body: string;
  eye: string;
  foot: string;
}

// Matches protocol.go IncomingMessage (Client -> Server)
export interface IncomingMessage {
  type: MsgType;
  nickname?: string;
  x?: number;
  y?: number;
  dir?: Direction;
  status?: PlayerStatus;
  text?: string;
  avatar?: number;
  colors?: ColorPalette;
  emoji?: Emoji;
  reconnect?: boolean;
}

// Matches protocol.go OutgoingMessage (Server -> Client)
export interface OutgoingMessage {
  type: MsgType;
  id?: string;
  nickname?: string;
  x: number;
  y: number;
  dir?: Direction;
  status?: PlayerStatus;
  text?: string;
  message?: string;
  emoji?: Emoji;
  colors?: ColorPalette;
  player?: PlayerInfo;
  players?: PlayerInfo[];
  self?: PlayerInfo;
  reconnect?: boolean;
}

// Matches protocol.go PlayerInfo (no omitempty — all fields required)
export interface PlayerInfo {
  id: string;
  nickname: string;
  x: number;
  y: number;
  status: PlayerStatus;
  dir: Direction;
  avatar: number;
  colors?: ColorPalette;
}

// Matches protocol.go map constants
export const MAP_WIDTH = 60;
export const MAP_HEIGHT = 45;
export const MAX_NICKNAME_LEN = 20;
export const MAX_CHAT_LEN = 500;

// Chat message for UI
export interface ChatMessage {
  nickname?: string;
  text: string;
  isSystem: boolean;
  timestamp: number;
}

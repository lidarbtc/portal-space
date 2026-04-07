import { writable } from 'svelte/store';
import type { WhiteboardDoc } from '$lib/whiteboard/yjs-doc';

export type WhiteboardTool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'text' | 'select';

// Whether the whiteboard panel is open
export const whiteboardOpen = writable(false);

// Current board ID being viewed
export const currentBoardId = writable<string | null>(null);

// Current drawing tool
export const currentTool = writable<WhiteboardTool>('pen');

// Current pen color
export const penColor = writable('#ffffff');

// Current pen width
export const penWidth = writable(3);

// Active Y.js document (set when whiteboard opens, null when closed)
export const activeDoc = writable<WhiteboardDoc | null>(null);

import { connectionState } from './stores/connection';
import { players, selfId, addSystemMessage } from './stores/game';
import { retryWithBackoff } from './utils/retry';
import type { MsgType, IncomingMessage, OutgoingMessage, Direction, PlayerStatus, Emoji, PlayerInfo, ColorPalette, ActionMessage, ChatImage } from './types';
import { DEFAULT_COLORS } from './game/palette-swap';

type MessageHandler = (msg: OutgoingMessage) => void;
type DisconnectHandler = () => void;

class NetworkClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler | DisconnectHandler> = new Map();
  private _connected = false;

  // Reconnection state
  private lastNickname = '';
  private lastColors: ColorPalette = { ...DEFAULT_COLORS };
  private lastX = 0;
  private lastY = 0;
  private shouldReconnect = false;
  private reconnecting = false;
  private cancelRetry: (() => void) | null = null;
  private connectTimeoutId: ReturnType<typeof setTimeout> | undefined;

  connect(nickname: string, colors: ColorPalette = { ...DEFAULT_COLORS }, onSnapshot?: (msg: OutgoingMessage) => void, position?: { x: number; y: number; reconnect?: boolean }): Promise<OutgoingMessage> {
    return new Promise((resolve, reject) => {
      // Clean up old socket before creating new one
      if (this.ws) {
        this.ws.onclose = () => {};
        this.ws.onerror = () => {};
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
        this.ws = null;
      }

      // Clear any pending timeout from previous connect
      if (this.connectTimeoutId !== undefined) {
        clearTimeout(this.connectTimeoutId);
        this.connectTimeoutId = undefined;
      }

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsPath = '/ws';

      // Handle /peer/{token}/ relay prefix
      const peerMatch = location.pathname.match(/^\/peer\/([^/]+)\//);
      if (peerMatch) {
        wsPath = `/peer/${peerMatch[1]}/ws`;
      }

      const url = `${proto}//${location.host}${wsPath}`;
      this.ws = new WebSocket(url);
      let settled = false;

      this.ws.onopen = () => {
        this._connected = true;
        connectionState.set('connected');
        this.send({ type: 'join', nickname, colors, ...position });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: OutgoingMessage = JSON.parse(event.data);

          if (msg.type === 'snapshot') {
            if (!settled) {
              settled = true;
              if (this.connectTimeoutId !== undefined) {
                clearTimeout(this.connectTimeoutId);
                this.connectTimeoutId = undefined;
              }
              if (msg.self) {
                this.lastX = msg.self.x;
                this.lastY = msg.self.y;
              }
              if (onSnapshot) onSnapshot(msg);
              resolve(msg);
            }
            // Dispatch to registered handler too (world.ts needs it)
          }
          if (msg.type === 'error') {
            if (!settled) {
              settled = true;
              reject(new Error(msg.message));
            }
            return;
          }
          const handler = this.handlers.get(msg.type);
          if (handler) (handler as MessageHandler)(msg);
        } catch (e) {
          console.error('[network] parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this._connected = false;

        // If reconnecting, this is from an old socket — ignore
        if (this.reconnecting) return;

        // Auto-reconnect: go directly to 'reconnecting', skip 'disconnected'
        // to prevent the $effect in +page.svelte from destroying the game
        if (this.shouldReconnect) {
          this.attemptReconnect();
          return;
        }

        connectionState.set('disconnected');
        const handler = this.handlers.get('disconnect');
        if (handler) (handler as DisconnectHandler)();
      };

      this.ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection failed'));
        }
      };

      // Store for reconnection
      this.lastNickname = nickname;
      this.lastColors = { ...colors };

      this.connectTimeoutId = setTimeout(() => {
        this.connectTimeoutId = undefined;
        if (!settled) {
          settled = true;
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  /** Mark as ready for auto-reconnect (call after first successful join) */
  enableReconnect(): void {
    this.shouldReconnect = true;
  }

  private attemptReconnect(): void {
    // Cancel any in-flight reconnect before starting new one
    if (this.cancelRetry) {
      this.cancelRetry();
      this.cancelRetry = null;
    }

    this.reconnecting = true;
    connectionState.set('reconnecting');

    const onReconnectSnapshot = (msg: OutgoingMessage) => {
      // Build fresh players map — msg.players can be undefined when alone in room
      const newMap = new Map<string, PlayerInfo>();
      if (msg.players) {
        for (const p of msg.players) {
          newMap.set(p.id, p);
        }
      }
      if (msg.self) {
        newMap.set(msg.self.id, msg.self);
      }
      players.set(newMap);
      if (msg.self) {
        selfId.set(msg.self.id);
        this.lastX = msg.self.x;
        this.lastY = msg.self.y;
      }
      addSystemMessage('재접속되었습니다.');
    };

    const { promise, cancel } = retryWithBackoff(
      () => this.connect(this.lastNickname, this.lastColors, onReconnectSnapshot, { x: this.lastX, y: this.lastY, reconnect: true }),
      { baseDelay: 1000, maxDelay: 16000, maxElapsed: 60000 }
    );

    this.cancelRetry = cancel;

    promise
      .then(() => {
        this.reconnecting = false;
        this.cancelRetry = null;
        connectionState.set('connected');
      })
      .catch(() => {
        this.reconnecting = false;
        this.shouldReconnect = false;
        this.cancelRetry = null;
        connectionState.set('disconnected');
        const handler = this.handlers.get('disconnect');
        if (handler) (handler as DisconnectHandler)();
      });
  }

  /** Intentional disconnect — do not auto-reconnect */
  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnecting = false;
    if (this.cancelRetry) {
      this.cancelRetry();
      this.cancelRetry = null;
    }
    if (this.ws) {
      this.ws.onclose = () => {};
      this.ws.onerror = () => {};
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    connectionState.set('disconnected');
  }

  send(msg: IncomingMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  on(type: MsgType | 'disconnect', handler: MessageHandler | DisconnectHandler): void {
    this.handlers.set(type, handler);
  }

  sendMove(x: number, y: number, dir: Direction): void {
    this.lastX = x;
    this.lastY = y;
    this.send({ type: 'move', x, y, dir });
  }

  sendStatus(status: PlayerStatus): void {
    this.send({ type: 'status', status });
  }

  sendChat(text: string, x: number, y: number): void {
    this.send({ type: 'chat', text, x, y });
  }

  sendChatMessage(x: number, y: number, text?: string, image?: ChatImage): void {
    const payload: IncomingMessage = { type: 'chat', x, y };
    if (text) {
      payload.text = text;
    }
    if (image) {
      payload.image = image;
    }
    this.send(payload);
  }

  sendDash(dir: Direction): void {
    this.send({ type: 'dash', dir });
  }

  sendEmote(emoji: Emoji): void {
    this.send({ type: 'emote', emoji });
  }

  sendCustomStatus(text: string): void {
    this.send({ type: 'customStatus', customStatus: text });
  }

  sendProfile(nickname: string, colors: ColorPalette): boolean {
    this.lastNickname = nickname;
    this.lastColors = { ...colors };
    return this.send({ type: 'profile', nickname, colors });
  }

  sendAction(domain: string, action: string, objectId?: string, payload?: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const envelope: Record<string, unknown> = { domain, action };
      if (objectId) envelope.objectId = objectId;
      if (payload !== undefined) envelope.payload = payload;
      // Send as { type: "action", payload: {object} } — payload must be a JSON object, not a string
      this.ws.send(JSON.stringify({ type: 'action', payload: envelope }));
    }
  }

  onAction(handler: (msg: ActionMessage) => void): void {
    this.on('action', ((msg: OutgoingMessage) => {
      if (msg.actionPayload) {
        handler(msg.actionPayload);
      }
    }) as MessageHandler);
  }

  get isConnected(): boolean {
    return this._connected;
  }
}

// Singleton instance — Phaser scenes import this directly
export const network = new NetworkClient();

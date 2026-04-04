import { writable } from 'svelte/store';
import type { MsgType, IncomingMessage, OutgoingMessage, Direction, PlayerStatus, Emoji } from './types';

export const connected = writable(false);

type MessageHandler = (msg: OutgoingMessage) => void;
type DisconnectHandler = () => void;

class NetworkClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler | DisconnectHandler> = new Map();
  private _connected = false;

  connect(nickname: string, avatar: number = 0): Promise<OutgoingMessage> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsPath = '/ws';

      // Handle /peer/{token}/ relay prefix
      const peerMatch = location.pathname.match(/^\/peer\/([^/]+)\//);
      if (peerMatch) {
        wsPath = `/peer/${peerMatch[1]}/ws`;
      }

      const url = `${proto}//${location.host}${wsPath}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._connected = true;
        connected.set(true);
        this.send({ type: 'join', nickname, avatar });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = JSON.parse(event.data);
          // Default missing x/y to 0 (Go omitempty on int omits zero values)
          const msg: OutgoingMessage = {
            ...raw,
            x: raw.x ?? 0,
            y: raw.y ?? 0
          };

          if (msg.type === 'snapshot') {
            resolve(msg);
          }
          if (msg.type === 'error') {
            reject(new Error(msg.message));
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
        connected.set(false);
        const handler = this.handlers.get('disconnect');
        if (handler) (handler as DisconnectHandler)();
      };

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };

      setTimeout(() => {
        if (!this._connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  send(msg: IncomingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type: MsgType | 'disconnect', handler: MessageHandler | DisconnectHandler): void {
    this.handlers.set(type, handler);
  }

  sendMove(x: number, y: number, dir: Direction): void {
    this.send({ type: 'move', x, y, dir });
  }

  sendStatus(status: PlayerStatus): void {
    this.send({ type: 'status', status });
  }

  // Preserve x, y parameters for exact protocol parity (network.js:82-83)
  sendChat(text: string, x: number, y: number): void {
    this.send({ type: 'chat', text, x, y });
  }

  sendEmote(emoji: Emoji): void {
    this.send({ type: 'emote', emoji });
  }

  get isConnected(): boolean {
    return this._connected;
  }
}

// Singleton instance — Phaser scenes import this directly
export const network = new NetworkClient();

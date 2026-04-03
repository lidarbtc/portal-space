// WebSocket network layer
const Network = {
    ws: null,
    handlers: {},
    connected: false,

    connect(nickname, avatar = 0) {
        return new Promise((resolve, reject) => {
            // Determine WebSocket URL based on current path
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
                this.connected = true;
                // Send join message
                this.send({ type: 'join', nickname: nickname, avatar: avatar });
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'snapshot') {
                        resolve(msg);
                    }
                    if (msg.type === 'error') {
                        reject(new Error(msg.message));
                        return;
                    }
                    const handler = this.handlers[msg.type];
                    if (handler) handler(msg);
                } catch (e) {
                    console.error('[network] parse error:', e);
                }
            };

            this.ws.onclose = () => {
                this.connected = false;
                const handler = this.handlers['disconnect'];
                if (handler) handler();
            };

            this.ws.onerror = (err) => {
                reject(new Error('WebSocket connection failed'));
            };

            // Timeout
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 5000);
        });
    },

    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    },

    on(type, handler) {
        this.handlers[type] = handler;
    },

    sendMove(x, y, dir) {
        this.send({ type: 'move', x, y, dir });
    },

    sendStatus(status) {
        this.send({ type: 'status', status });
    },

    sendChat(text, x, y) {
        this.send({ type: 'chat', text, x, y });
    },

    sendEmote(emoji) {
        this.send({ type: 'emote', emoji });
    }
};

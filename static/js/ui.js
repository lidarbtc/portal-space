// UI management for status bar and chat
const UI = {
    currentStatus: 'coding',
    chatVisible: false,
    onStatusChange: null,
    onChatSend: null,
    chatInputActive: false,
    chatMessages: [],
    maxChatMessages: 50,
    userScrolled: false,

    init() {
        this.createStatusBar();
        this.createChatLog();
        this.createChatUI();
        this.createPlayerCount();
        this.setupKeyboardShortcut();
    },

    createStatusBar() {
        const bar = document.createElement('div');
        bar.id = 'status-bar';

        const statuses = [
            { key: 'coding', label: '💻 코딩중' },
            { key: 'resting', label: '☕ 휴식' },
            { key: 'away', label: '🚶 자리비움' }
        ];

        statuses.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'status-btn' + (s.key === this.currentStatus ? ' active' : '');
            btn.textContent = s.label;
            btn.dataset.status = s.key;
            btn.addEventListener('click', () => {
                if (this.currentStatus === s.key) return;
                this.currentStatus = s.key;
                document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.onStatusChange) this.onStatusChange(s.key);
            });
            bar.appendChild(btn);
        });

        document.body.appendChild(bar);
    },

    createChatLog() {
        const log = document.createElement('div');
        log.id = 'chat-log';

        // Pause auto-scroll when user scrolls up
        log.addEventListener('scroll', () => {
            const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 10;
            this.userScrolled = !atBottom;
        });

        document.body.appendChild(log);
    },

    addChatMessage(nickname, text) {
        const log = document.getElementById('chat-log');
        if (!log) return;

        // FIFO: remove oldest if over limit
        this.chatMessages.push({ nickname, text });
        if (this.chatMessages.length > this.maxChatMessages) {
            this.chatMessages.shift();
            if (log.firstChild) log.removeChild(log.firstChild);
        }

        const entry = document.createElement('div');
        entry.className = 'chat-entry';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'chat-name';
        nameSpan.textContent = nickname;

        const textSpan = document.createElement('span');
        textSpan.className = 'chat-text';
        textSpan.textContent = ' ' + text;

        entry.appendChild(nameSpan);
        entry.appendChild(textSpan);
        log.appendChild(entry);

        // Auto-scroll if user hasn't scrolled up
        if (!this.userScrolled) {
            log.scrollTop = log.scrollHeight;
        }
    },

    createChatUI() {
        // Chat input
        const container = document.createElement('div');
        container.id = 'chat-container';

        const input = document.createElement('input');
        input.id = 'chat-input';
        input.type = 'text';
        input.placeholder = '메시지 입력...';
        input.maxLength = 500;
        input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // Prevent game from receiving key events
            if (e.key === 'Enter') {
                const text = input.value.trim();
                if (text && this.onChatSend) {
                    this.onChatSend(text);
                }
                input.value = '';
                this.hideChat();
            } else if (e.key === 'Escape') {
                input.value = '';
                this.hideChat();
            }
        });
        container.appendChild(input);
        document.body.appendChild(container);

        // Chat hint
        const hint = document.createElement('div');
        hint.id = 'chat-hint';
        hint.textContent = 'Enter로 채팅';
        document.body.appendChild(hint);
    },

    createPlayerCount() {
        const el = document.createElement('div');
        el.id = 'player-count';
        el.textContent = '접속: 0명';
        document.body.appendChild(el);
    },

    updatePlayerCount(count) {
        const el = document.getElementById('player-count');
        if (el) el.textContent = `접속: ${count}명`;
    },

    setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !this.chatVisible) {
                e.preventDefault();
                this.showChat();
            }
        });
    },

    showChat() {
        const container = document.getElementById('chat-container');
        const input = document.getElementById('chat-input');
        const hint = document.getElementById('chat-hint');
        if (container && input) {
            container.style.display = 'block';
            if (hint) hint.style.display = 'none';
            input.focus();
            this.chatVisible = true;
            this.chatInputActive = true;
        }
    },

    hideChat() {
        const container = document.getElementById('chat-container');
        const hint = document.getElementById('chat-hint');
        if (container) {
            container.style.display = 'none';
            if (hint) hint.style.display = 'block';
            this.chatVisible = false;
            this.chatInputActive = false;
        }
    },

    isChatActive() {
        return this.chatInputActive;
    }
};

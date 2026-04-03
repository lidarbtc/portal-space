// Notification audio manager
const NotifyAudio = {
    volume: 0.5,
    muted: false,
    audioCtx: null,
    _lastPlay: 0,

    init() {
        const saved = localStorage.getItem('audio-volume');
        if (saved !== null) {
            const parsed = parseFloat(saved);
            if (isFinite(parsed)) this.setVolume(parsed);
        }
        const savedMuted = localStorage.getItem('audio-muted');
        if (savedMuted !== null) this.muted = savedMuted === 'true';
    },

    _ensureContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioCtx;
    },

    playIfHidden() {
        if ((!document.hidden && document.hasFocus()) || this.muted || this.volume <= 0) return;

        const now = Date.now();
        if (now - this._lastPlay < 500) return;
        this._lastPlay = now;

        try {
            const ctx = this._ensureContext();

            const doPlay = () => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);

                gain.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };

                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            };

            if (ctx.state === 'suspended') {
                ctx.resume().then(doPlay).catch(() => {});
            } else {
                doPlay();
            }
        } catch (e) {
            // Silently fail if audio is unavailable
        }
    },

    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        localStorage.setItem('audio-volume', this.volume);
    },

    setMuted(m) {
        this.muted = Boolean(m);
        localStorage.setItem('audio-muted', this.muted ? 'true' : 'false');
    },

    getVolume() {
        return this.volume;
    },

    isMuted() {
        return this.muted;
    }
};

NotifyAudio.init();

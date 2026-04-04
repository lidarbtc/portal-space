import { get } from 'svelte/store';
import { volume, muted } from './stores/settings';

class NotifyAudio {
  private audioCtx: AudioContext | null = null;
  private lastPlay = 0;

  ensureContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  playIfHidden(): void {
    const isMuted = get(muted);
    const vol = get(volume);

    if ((!document.hidden && document.hasFocus()) || isMuted || vol <= 0) return;

    const now = Date.now();
    if (now - this.lastPlay < 500) return;
    this.lastPlay = now;

    try {
      const ctx = this.ensureContext();

      const doPlay = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
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
    } catch {
      // Silently fail if audio is unavailable
    }
  }
}

export const notifyAudio = new NotifyAudio();

class SettingsStore {
  volume = $state(0.5);
  muted = $state(false);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const savedVol = localStorage.getItem('audio-volume');
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (isFinite(parsed)) this.volume = parsed;
      }
      const savedMuted = localStorage.getItem('audio-muted');
      if (savedMuted !== null) this.muted = savedMuted === 'true';
    }

    // Cleanup intentionally not called — singleton lives for app lifetime
    $effect.root(() => {
      $effect(() => {
        if (typeof localStorage !== 'undefined')
          localStorage.setItem('audio-volume', String(this.volume));
      });
      $effect(() => {
        if (typeof localStorage !== 'undefined')
          localStorage.setItem('audio-muted', this.muted ? 'true' : 'false');
      });
    });
  }
}

export const settingsState = new SettingsStore();

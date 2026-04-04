<script lang="ts">
  import { network } from '$lib/network';
  import type { OutgoingMessage } from '$lib/types';
  import { PersistedState } from 'runed';

  let { onJoin }: { onJoin: (data: { nickname: string; avatar: number; snapshot: OutgoingMessage }) => void } = $props();

  const persistedNickname = new PersistedState('portal-nickname', '');
  let selectedAvatar = $state(0);
  let error = $state('');
  let joining = $state(false);

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing && !joining) {
      handleJoin();
    }
  }

  // Canvas refs for avatars 1-3
  let canvas1: HTMLCanvasElement | undefined = $state();
  let canvas2: HTMLCanvasElement | undefined = $state();
  let canvas3: HTMLCanvasElement | undefined = $state();

  interface AvatarPalette {
    primary: string;
    secondary: string;
  }

  const NICKNAME_NOUNS = ['고랭', '고퍼', '고슬람', '러슬람', '페리스', '포탈', '터널', '릴레이'];

  function generateRandomNickname(): string {
    const noun = NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)];
    const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return noun + digits;
  }

  const palettes: AvatarPalette[] = [
    { primary: '#4a90d9', secondary: '#2c5a8a' },
    { primary: '#5cb85c', secondary: '#3a7a3a' },
    { primary: '#d94a4a', secondary: '#8a2c2c' }
  ];

  function drawAvatar(canvas: HTMLCanvasElement, palette: AvatarPalette) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const scale = w / 48;

    // Head
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(cx, cy - 8 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = palette.secondary;
    ctx.fillRect(cx - 6 * scale, cy, 12 * scale, 12 * scale);

    // Eyes (front-facing, dir=0 means down)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 3 * scale, cy - 9 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 3 * scale, cy - 9 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx - 3 * scale, cy - 8 * scale, 1 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 3 * scale, cy - 8 * scale, 1 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Feet
    ctx.fillStyle = palette.primary;
    ctx.fillRect(cx - 6 * scale, cy + 12 * scale, 5 * scale, 3 * scale);
    ctx.fillRect(cx + 1 * scale, cy + 12 * scale, 5 * scale, 3 * scale);
  }

  $effect(() => {
    if (canvas1) drawAvatar(canvas1, palettes[0]);
  });

  $effect(() => {
    if (canvas2) drawAvatar(canvas2, palettes[1]);
  });

  $effect(() => {
    if (canvas3) drawAvatar(canvas3, palettes[2]);
  });

  async function handleJoin() {
    error = '';
    persistedNickname.current = persistedNickname.current.trim();

    if (!persistedNickname.current) {
      error = '닉네임을 입력해주세요.';
      return;
    }

    if (persistedNickname.current.length > 20) {
      error = '닉네임은 20자 이하로 입력해주세요.';
      return;
    }

    joining = true;

    try {
      const snapshot = await network.connect(persistedNickname.current, selectedAvatar);
      onJoin({ nickname: persistedNickname.current, avatar: selectedAvatar, snapshot });
    } catch (err) {
      error = err instanceof Error ? err.message : '연결에 실패했습니다.';
      joining = false;
    }
  }

</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div id="lobby-overlay">
  <div id="nickname-form">
    <h1>Portal Space</h1>
    <p>2D 가상 코워킹 스페이스</p>

    <div class="avatar-grid">
      <button
        class="avatar-option {selectedAvatar === 0 ? 'selected' : ''}"
        onclick={() => (selectedAvatar = 0)}
        aria-label="Gopher avatar"
      >
        <div class="avatar-sprite" style="background-image: url('/assets/gopher.png'); background-position: 0 0; background-size: {4 * 48}px 48px;"></div>
      </button>
      <button
        class="avatar-option {selectedAvatar === 1 ? 'selected' : ''}"
        onclick={() => (selectedAvatar = 1)}
        aria-label="Blue avatar"
      >
        <canvas bind:this={canvas1} width="48" height="48"></canvas>
      </button>
      <button
        class="avatar-option {selectedAvatar === 2 ? 'selected' : ''}"
        onclick={() => (selectedAvatar = 2)}
        aria-label="Green avatar"
      >
        <canvas bind:this={canvas2} width="48" height="48"></canvas>
      </button>
      <button
        class="avatar-option {selectedAvatar === 3 ? 'selected' : ''}"
        onclick={() => (selectedAvatar = 3)}
        aria-label="Red avatar"
      >
        <canvas bind:this={canvas3} width="48" height="48"></canvas>
      </button>
    </div>

    <div class="input-row">
      <div class="nickname-input-wrapper">
        <input
          id="nickname-input"
          type="text"
          placeholder="닉네임 입력"
          maxlength={20}
          bind:value={persistedNickname.current}
        />
        <button
          class="nickname-dice-btn"
          onclick={() => (persistedNickname.current = generateRandomNickname())}
          aria-label="랜덤 닉네임 생성"
          type="button"
        >
          🎲
        </button>
      </div>

      <button id="join-btn" onclick={handleJoin} disabled={joining}>
        {joining ? '접속 중...' : '입장'}
      </button>
    </div>

    {#if error}
      <div id="error-msg">{error}</div>
    {/if}
  </div>
</div>

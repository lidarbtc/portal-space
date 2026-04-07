<script lang="ts">
  import { network } from '$lib/network';
  import { createPreviewCanvas, DEFAULT_COLORS } from '$lib/game/palette-swap';
  import type { OutgoingMessage, ColorPalette } from '$lib/types';
  import { PersistedState } from 'runed';

  let { onJoin }: { onJoin: (data: { nickname: string; colors: ColorPalette; snapshot: OutgoingMessage }) => void } = $props();

  const persistedNickname = new PersistedState('portal-nickname', '');
  const persistedBodyColor = new PersistedState('portal-color-body', DEFAULT_COLORS.body);
  const persistedEyeColor = new PersistedState('portal-color-eye', DEFAULT_COLORS.eye);
  const persistedFootColor = new PersistedState('portal-color-foot', DEFAULT_COLORS.foot);

  let error = $state('');
  let joining = $state(false);
  let previewCanvas: HTMLCanvasElement | undefined = $state();
  let gopherImage: HTMLImageElement | null = $state(null);

  const PRESETS: { name: string; body: string; eye: string; foot: string }[] = [
    { name: '기본', body: '#80d3e1', eye: '#ffffff', foot: '#eacb9e' },
    { name: '노을', body: '#d94a4a', eye: '#ffffff', foot: '#8a2c2c' },
    { name: '숲', body: '#5cb85c', eye: '#ffffff', foot: '#3a7a3a' },
    { name: '바다', body: '#4a90d9', eye: '#ffffff', foot: '#2c5a8a' },
    { name: '보라', body: '#9b59b6', eye: '#ffffff', foot: '#6c3483' },
    { name: '골드', body: '#f39c12', eye: '#ffffff', foot: '#d35400' },
  ];

  const NICKNAME_NOUNS = ['고랭', '고퍼', '고슬람', '러슬람', '페리스', '포탈', '터널', '릴레이'];

  function generateRandomNickname(): string {
    const noun = NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)];
    const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return noun + digits;
  }

  function getCurrentColors(): ColorPalette {
    return {
      body: persistedBodyColor.current,
      eye: persistedEyeColor.current,
      foot: persistedFootColor.current,
    };
  }

  function applyPreset(preset: typeof PRESETS[number]) {
    persistedBodyColor.current = preset.body;
    persistedEyeColor.current = preset.eye;
    persistedFootColor.current = preset.foot;
  }

  function resetColors() {
    applyPreset(PRESETS[0]);
  }

  // Load gopher image for preview
  $effect(() => {
    const img = new Image();
    img.src = '/assets/gopher.png';
    img.onload = () => { gopherImage = img; };
    img.onerror = () => { gopherImage = null; };
  });

  // Update preview when colors or canvas change
  $effect(() => {
    if (previewCanvas && gopherImage) {
      const colors = getCurrentColors();
      createPreviewCanvas(previewCanvas, colors, gopherImage);
    }
  });

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing && !joining) {
      handleJoin();
    }
  }

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
    const colors = getCurrentColors();

    try {
      const snapshot = await network.connect(persistedNickname.current, colors);
      onJoin({ nickname: persistedNickname.current, colors, snapshot });
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

    <div class="customization-area">
      <div class="preview-section">
        <canvas bind:this={previewCanvas} width="96" height="96" class="gopher-preview"></canvas>
      </div>

      <div class="color-controls">
        <div class="preset-row">
          {#each PRESETS as preset}
            <button
              class="preset-btn"
              onclick={() => applyPreset(preset)}
              aria-label="{preset.name} 프리셋"
              title={preset.name}
            >
              <span class="preset-swatch" style="background: {preset.body};"></span>
            </button>
          {/each}
        </div>

        <div class="color-pickers">
          <label class="color-picker-label">
            <span class="color-label-text">몸통</span>
            <input type="color" bind:value={persistedBodyColor.current} />
          </label>
          <label class="color-picker-label">
            <span class="color-label-text">눈</span>
            <input type="color" bind:value={persistedEyeColor.current} />
          </label>
          <label class="color-picker-label">
            <span class="color-label-text">배/발</span>
            <input type="color" bind:value={persistedFootColor.current} />
          </label>
          <button class="reset-btn" onclick={resetColors} type="button" title="기본 색상으로 복원">
            초기화
          </button>
        </div>
      </div>
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

<style>
  .customization-area {
    display: flex;
    gap: 16px;
    margin-bottom: 1.5rem;
    align-items: center;
  }

  .preview-section {
    flex-shrink: 0;
  }

  .gopher-preview {
    width: 96px;
    height: 96px;
    image-rendering: pixelated;
    border: 3px solid #0f3460;
    border-radius: 8px;
    background: #16213e;
  }

  .color-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
  }

  .preset-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .preset-btn {
    width: 32px;
    height: 32px;
    border: 2px solid #0f3460;
    border-radius: 6px;
    cursor: pointer;
    background: #16213e;
    padding: 3px;
    transition: border-color 0.2s;
  }

  .preset-btn:hover {
    border-color: var(--color-primary-hover);
  }

  .preset-swatch {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 3px;
  }

  .color-pickers {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .color-picker-label {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .color-label-text {
    font-size: 12px;
    color: #aaaacc;
  }

  .color-picker-label input[type="color"] {
    width: 28px;
    height: 28px;
    border: 2px solid #0f3460;
    border-radius: 4px;
    cursor: pointer;
    background: none;
    padding: 0;
  }

  .color-picker-label input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-picker-label input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }

  .reset-btn {
    font-size: 11px;
    padding: 4px 8px;
    border: 1px solid #0f3460;
    border-radius: 4px;
    background: #16213e;
    color: #aaaacc;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .reset-btn:hover {
    border-color: var(--color-primary-hover);
    color: #e0e0ff;
  }

  @media (max-width: 480px) {
    .customization-area {
      flex-direction: column;
    }
  }
</style>

<script lang="ts">
  import { ToggleGroup, Slider, Switch } from 'bits-ui';
  import { currentStatus } from '$lib/stores/game';
  import { network } from '$lib/network';
  import type { PlayerStatus, Emoji } from '$lib/types';
  import { CircleUserRound, SmilePlus, Settings } from '@lucide/svelte';
  import { volume, muted } from '$lib/stores/settings';

  type PanelType = 'status' | 'emote' | 'settings' | null;

  let openPanel: PanelType = $state(null);
  let volumePercent = $derived(Math.round($volume * 100));

  const statuses: { key: PlayerStatus; label: string }[] = [
    { key: 'coding', label: '💻 코딩중' },
    { key: 'resting', label: '☕ 휴식' },
    { key: 'away', label: '🚶 자리비움' },
  ];

  const emotes: { emoji: Emoji; label: string }[] = [
    { emoji: '👋', label: '인사' },
    { emoji: '☕', label: '커피' },
    { emoji: '🔥', label: '불꽃' },
    { emoji: '💻', label: '코딩' },
  ];

  function togglePanel(panel: PanelType) {
    openPanel = openPanel === panel ? null : panel;
  }

  function handleStatusChange(value: string | undefined) {
    if (value) {
      const status = value as PlayerStatus;
      currentStatus.set(status);
      network.sendStatus(status);
    }
  }

  function handleEmote(emoji: Emoji) {
    network.sendEmote(emoji);
  }

  let containerEl: HTMLDivElement | undefined = $state(undefined);

  $effect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerEl && !containerEl.contains(e.target as Node)) {
        if ((e.target as HTMLElement).closest('[data-slider-root]')) return;
        openPanel = null;
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="action-bar-wrapper" bind:this={containerEl}>
  {#if openPanel === 'status'}
    <ToggleGroup.Root
      type="single"
      class="dropdown"
      value={$currentStatus}
      onValueChange={handleStatusChange}
    >
      {#each statuses as { key, label } (key)}
        <ToggleGroup.Item value={key} class="dropdown-item status-item">
          {label}
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  {/if}

  {#if openPanel === 'emote'}
    <div class="dropdown">
      {#each emotes as emote (emote.emoji)}
        <button class="dropdown-item emote-item" onclick={() => handleEmote(emote.emoji)}>
          <span class="emote-emoji">{emote.emoji}</span>
          <span class="emote-label">{emote.label}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if openPanel === 'settings'}
    <div class="dropdown settings-dropdown">
      <div class="setting-row">
        <span>볼륨</span>
        <Slider.Root
          type="single"
          min={0}
          max={100}
          step={1}
          value={volumePercent}
          onValueChange={(v) => volume.set(v / 100)}
        >
          <Slider.Range />
          <Slider.Thumb index={0} />
        </Slider.Root>
      </div>
      <div class="setting-row">
        <span>음소거</span>
        <Switch.Root
          checked={$muted}
          onCheckedChange={(checked) => muted.set(checked)}
        >
          <Switch.Thumb />
        </Switch.Root>
      </div>
    </div>
  {/if}

  <div class="pill-bar">
    <button
      class="tab-button"
      class:active={openPanel === 'status'}
      onclick={() => togglePanel('status')}
    >
      <CircleUserRound size={24} />
    </button>
    <button
      class="tab-button"
      class:active={openPanel === 'emote'}
      onclick={() => togglePanel('emote')}
    >
      <SmilePlus size={24} />
    </button>
    <button
      class="tab-button"
      class:active={openPanel === 'settings'}
      onclick={() => togglePanel('settings')}
    >
      <Settings size={24} />
    </button>
  </div>
</div>

<style>
  .action-bar-wrapper {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-family: 'MulmaruMono', monospace;
  }

  .pill-bar {
    display: flex;
    align-items: center;
    background: rgba(16, 24, 48, 0.9);
    border: none;
    border-radius: 12px;
    padding: 8px;
    gap: 4px;
  }

  .tab-button {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 20px;
    border-radius: 8px;
    color: #aaaacc;
    font-size: 14px;
    font-family: 'MulmaruMono', monospace;
    transition: background 0.2s, color 0.2s;
    user-select: none;
  }

  .tab-button:hover {
    color: #e0e0ff;
  }

  .tab-button.active {
    background: var(--color-primary);
    color: #e0e0ff;
  }

  .action-bar-wrapper :global(.dropdown) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(16, 24, 48, 0.95);
    border: none;
    border-radius: 12px;
    padding: 8px;
    z-index: 51;
    min-width: 160px;
  }

  .action-bar-wrapper :global(.dropdown-item) {
    all: unset;
    cursor: pointer;
    padding: 8px 16px;
    border-radius: 8px;
    color: #aaaacc;
    font-size: 14px;
    font-family: 'MulmaruMono', monospace;
    transition: background 0.15s, color 0.15s;
    text-align: left;
    user-select: none;
  }

  .action-bar-wrapper :global(.dropdown-item:hover) {
    background: var(--color-primary-alpha-50);
    color: #e0e0ff;
  }

  .action-bar-wrapper :global([data-state='on']) {
    background: var(--color-primary);
    color: #e0e0ff;
  }

  .action-bar-wrapper :global(.emote-item) {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
  }

  .action-bar-wrapper :global(.emote-emoji) {
    font-size: 18px;
  }

  .action-bar-wrapper :global(.emote-label) {
    font-size: 13px;
  }

  .settings-dropdown .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
  }

  .settings-dropdown .setting-row span {
    color: #aaaacc;
    font-size: 14px;
    font-family: 'MulmaruMono', monospace;
  }
</style>

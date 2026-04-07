<script lang="ts">
  import { ToggleGroup } from 'bits-ui';
  import { currentStatus } from '$lib/stores/game';
  import { network } from '$lib/network';
  import type { PlayerStatus, Emoji } from '$lib/types';
  import { CircleUserRound, SmilePlus, Settings } from '@lucide/svelte';
  import CustomStatusModal from './CustomStatusModal.svelte';

  let { onOpenSettings }: { onOpenSettings?: () => void } = $props();

  type PanelType = 'status' | 'emote' | null;

  let openPanel: PanelType = $state(null);

  const statuses: { key: PlayerStatus; label: string; color: string }[] = [
    { key: 'online', label: '온라인', color: '#4ade80' },
    { key: 'away', label: '자리비움', color: '#eab308' },
    { key: 'dnd', label: '방해금지', color: '#ef4444' },
  ];

  const emotes: { emoji: Emoji; label: string }[] = [
    { emoji: '👋', label: '인사' },
    { emoji: '☕', label: '커피' },
    { emoji: '🔥', label: '불꽃' },
    { emoji: '💻', label: '코딩' },
    { emoji: '📢', label: '확성기' },
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

  let customStatusModalOpen = $state(false);

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
    <div class="dropdown">
      <ToggleGroup.Root
        type="single"
        value={$currentStatus}
        onValueChange={handleStatusChange}
      >
        {#each statuses as { key, label, color } (key)}
          <ToggleGroup.Item value={key} class="dropdown-item status-item">
            <span style="color: {color}">●</span> {label}
          </ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <button
        class="dropdown-item custom-status-btn"
        onclick={() => { openPanel = null; customStatusModalOpen = true; }}
      >
        ✏️ 상태 설정
      </button>
    </div>
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
      onclick={() => { openPanel = null; onOpenSettings?.(); }}
    >
      <Settings size={24} />
    </button>
  </div>
</div>

<CustomStatusModal bind:open={customStatusModalOpen} />

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

  .action-bar-wrapper :global(.dropdown [data-toggle-group-root]) {
    display: flex;
    flex-direction: column;
    gap: 4px;
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

  .custom-status-btn {
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
    border-top: 1px solid rgba(15, 52, 96, 0.5);
    margin-top: 4px;
    padding-top: 12px;
  }

  .custom-status-btn:hover {
    background: var(--color-primary-alpha-50);
    color: #e0e0ff;
  }

</style>

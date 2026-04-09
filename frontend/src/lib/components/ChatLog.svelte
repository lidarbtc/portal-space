<script lang="ts">
  import { chatMessages } from '$lib/stores/game';
  import { activeChatTab, currentZoneId, currentZoneName, regionalMessages } from '$lib/stores/regional-chat';
  import type { ChatChannel } from '$lib/types';
  import { parseTextWithUrls } from '$lib/utils/linkify';
  import { AlertDialog } from 'bits-ui';

  let chatLogEl: HTMLDivElement | undefined = $state();
  let atBottom = $state(true);
  let openLinkDialog = $state(false);
  let pendingUrl = $state('');

  let displayMessages = $derived($activeChatTab === 'regional' && $currentZoneId ? $regionalMessages : $chatMessages);

  function switchTab(tab: ChatChannel) {
    activeChatTab.set(tab);
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}]`;
  }

  function handleLinkClick(e: MouseEvent, url: string) {
    e.preventDefault();
    pendingUrl = url;
    openLinkDialog = true;
  }

  function handleConfirm() {
    window.open(pendingUrl, '_blank', 'noopener,noreferrer');
    openLinkDialog = false;
  }

  function handleScroll() {
    if (!chatLogEl) return;
    atBottom = chatLogEl.scrollHeight - chatLogEl.scrollTop - chatLogEl.clientHeight < 10;
  }

  $effect(() => {
    const msgs = displayMessages;
    if (atBottom && chatLogEl) {
      requestAnimationFrame(() => {
        if (chatLogEl) {
          chatLogEl.scrollTop = chatLogEl.scrollHeight;
        }
      });
    }
  });
</script>

<div class="chat-tab-bar">
  <button
    class="chat-tab"
    class:active={$activeChatTab === 'global'}
    onclick={() => switchTab('global')}
  >
    Global
  </button>
  {#if $currentZoneId}
    <button
      class="chat-tab"
      class:active={$activeChatTab === 'regional'}
      onclick={() => switchTab('regional')}
    >
      {$currentZoneName ?? 'Regional'}
    </button>
  {/if}
</div>

<div id="chat-log" bind:this={chatLogEl} onscroll={handleScroll}>
  {#each displayMessages as message, i (i)}
    {#if message.isSystem}
      <div class="chat-entry chat-system"><span class="chat-time">{formatTime(message.timestamp)}</span><span class="chat-system-text">{#each parseTextWithUrls(message.text) as segment}{#if segment.type === 'url'}<a href={segment.value} onclick={(e) => handleLinkClick(e, segment.value)}>{segment.value}</a>{:else}{segment.value}{/if}{/each}</span></div>
    {:else}
      <div class="chat-entry">
        <span class="chat-time">{formatTime(message.timestamp)}</span><span class="chat-name" style:color={message.nicknameColor ?? undefined}>{message.nickname}</span>
        <span class="chat-text"> {#each parseTextWithUrls(message.text) as segment}{#if segment.type === 'url'}<a href={segment.value} onclick={(e) => handleLinkClick(e, segment.value)}>{segment.value}</a>{:else}{segment.value}{/if}{/each}</span>
      </div>
    {/if}
  {/each}
</div>

<AlertDialog.Root bind:open={openLinkDialog}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="link-dialog-overlay" />
    <AlertDialog.Content class="link-dialog-content">
      <AlertDialog.Title class="link-dialog-title">외부 사이트로 이동</AlertDialog.Title>
      <AlertDialog.Description class="link-dialog-desc">
        다음 링크를 열겠습니까?
      </AlertDialog.Description>
      <p class="link-dialog-url">{pendingUrl}</p>
      <div class="link-dialog-actions">
        <AlertDialog.Cancel class="link-dialog-btn link-dialog-cancel">취소</AlertDialog.Cancel>
        <AlertDialog.Action class="link-dialog-btn link-dialog-confirm" onclick={handleConfirm}>열기</AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  .chat-tab-bar {
    display: flex;
    gap: 0;
    padding: 0 4px;
    background: transparent;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  .chat-tab {
    font-family: 'MulmaruMono', monospace;
    font-size: 0.75rem;
    padding: 6px 12px;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: #888899;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
  }

  .chat-tab:hover {
    color: #ccccdd;
    border-bottom-color: rgba(255, 255, 255, 0.2);
  }

  .chat-tab.active {
    color: #e0e0ff;
    border-bottom-color: var(--color-primary);
    font-weight: bold;
  }

  :global(.link-dialog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.6);
  }

  :global(.link-dialog-content) {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 201;
    transform: translate(-50%, -50%);
    background: rgba(16, 24, 48, 0.95);
    border: none;
    border-radius: 8px;
    padding: 20px;
    width: 360px;
    max-width: calc(100% - 32px);
    font-family: 'MulmaruMono', monospace;
  }

  :global(.link-dialog-title) {
    color: #e0e0ff;
    font-size: 1.125rem;
    font-weight: bold;
    margin-bottom: 8px;
  }

  :global(.link-dialog-desc) {
    color: #888899;
    font-size: 0.875rem;
    margin-bottom: 8px;
  }

  :global(.link-dialog-url) {
    color: #66ccff;
    font-size: 0.8125rem;
    word-break: break-all;
    background: rgba(0, 0, 0, 0.3);
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 16px;
  }

  :global(.link-dialog-actions) {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  :global(.link-dialog-btn) {
    font-family: 'MulmaruMono', monospace;
    font-size: 0.875rem;
    padding: 6px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  :global(.link-dialog-cancel) {
    background: rgba(255, 255, 255, 0.1);
    color: #ccccdd;
  }

  :global(.link-dialog-cancel:hover) {
    background: rgba(255, 255, 255, 0.15);
  }

  :global(.link-dialog-confirm) {
    background: var(--color-primary);
    color: #0a0a1a;
    font-weight: bold;
  }

  :global(.link-dialog-confirm:hover) {
    background: var(--color-primary-hover);
  }
</style>

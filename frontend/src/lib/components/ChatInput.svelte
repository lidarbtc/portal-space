<script lang="ts">
  import { onMount } from 'svelte';
  import { chatInputActive } from '$lib/stores/game';

  let { onSend, mobile = false }: { onSend: (text: string) => void; mobile?: boolean } = $props();

  let inputEl: HTMLInputElement | undefined = $state();
  let inputValue = $state('');

  onMount(() => {
    if (mobile) {
      chatInputActive.set(true);
    }
  });

  function showInput() {
    chatInputActive.set(true);
    requestAnimationFrame(() => {
      inputEl?.focus();
    });
  }

  function hideInput() {
    inputValue = '';
    if (!mobile) {
      chatInputActive.set(false);
    }
  }

  function sendMessage() {
    const text = inputValue.trim();
    if (text) {
      onSend(text);
    }
    inputValue = '';
    if (mobile) {
      inputEl?.blur();
    } else {
      hideInput();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      sendMessage();
    } else if (e.key === 'Escape') {
      hideInput();
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (mobile) return;
    if (e.key === 'Enter' && !$chatInputActive) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      showInput();
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div id="chat-container" class:mobile>
  {#if mobile || $chatInputActive}
    <div class="chat-input-row">
      <input
        id="chat-input"
        type="text"
        placeholder="메시지 입력..."
        maxlength={500}
        bind:this={inputEl}
        bind:value={inputValue}
        onkeydown={handleKeydown}
      />
      {#if mobile}
        <button class="chat-send-btn" onclick={sendMessage} aria-label="전송">↑</button>
      {/if}
    </div>
  {:else}
    <div id="chat-hint">Enter로 채팅</div>
  {/if}
</div>

<style>
  .chat-input-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .mobile .chat-input-row {
    padding: 6px 8px;
  }

  .mobile :global(#chat-input) {
    flex: 1;
  }

  .chat-send-btn {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border: 2px solid #0f3460;
    border-radius: 6px;
    background: #533483;
    color: #e0e0ff;
    font-size: 1.1rem;
    font-family: 'MulmaruMono', monospace;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .chat-send-btn:active {
    background: #6a42a0;
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { useEventListener } from 'runed';
  import { chatInputActive } from '$lib/stores/game';

  let { onSend, mobile = false, alwaysActive = false }: { onSend: (text: string) => void; mobile?: boolean; alwaysActive?: boolean } = $props();

  let inputEl: HTMLInputElement | undefined = $state();
  let inputValue = $state('');

  onMount(() => {
    if (mobile) {
      chatInputActive.set(true);
    }
  });

  function handleFocus() {
    chatInputActive.set(true);
  }

  function handleBlur() {
    if (!mobile) {
      chatInputActive.set(false);
    }
  }

  useEventListener(() => document, 'keydown', (e: KeyboardEvent) => {
    if (!alwaysActive) return;
    if (e.key !== 'j' && e.key !== 'J') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || (el as HTMLElement)?.isContentEditable) return;
    e.preventDefault();
    inputEl?.focus();
  });

  function showInput() {
    chatInputActive.set(true);
    requestAnimationFrame(() => {
      inputEl?.focus();
    });
  }

  function hideInput() {
    inputValue = '';
    if (alwaysActive) {
      inputEl?.blur();
    } else if (!mobile) {
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
    } else if (alwaysActive) {
      // Keep input active, just clear the value
    } else {
      hideInput();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) {
      sendMessage();
    } else if (e.key === 'Escape') {
      hideInput();
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (mobile || alwaysActive) return;
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
  {#if mobile || alwaysActive || $chatInputActive}
    <div class="chat-input-row">
      <input
        id="chat-input"
        type="text"
        placeholder={alwaysActive ? '메시지를 입력해주세요 (J)' : '메시지 입력...'}
        maxlength={500}
        bind:this={inputEl}
        bind:value={inputValue}
        onkeydown={handleKeydown}
        onfocus={handleFocus}
        onblur={handleBlur}
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
    background: var(--color-primary);
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
    background: var(--color-primary-hover);
  }
</style>

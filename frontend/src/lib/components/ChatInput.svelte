<script lang="ts">
  import { chatInputActive } from '$lib/stores/game';

  let { onSend }: { onSend: (text: string) => void } = $props();

  let inputEl: HTMLInputElement | undefined = $state();
  let inputValue = $state('');

  function showInput() {
    chatInputActive.set(true);
    // Focus after DOM update
    requestAnimationFrame(() => {
      inputEl?.focus();
    });
  }

  function hideInput() {
    inputValue = '';
    chatInputActive.set(false);
  }

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = inputValue.trim();
      if (text) {
        onSend(text);
      }
      hideInput();
    } else if (e.key === 'Escape') {
      hideInput();
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
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

<div id="chat-container">
  {#if $chatInputActive}
    <input
      id="chat-input"
      type="text"
      placeholder="메시지 입력..."
      maxlength={500}
      bind:this={inputEl}
      bind:value={inputValue}
      onkeydown={handleKeydown}
    />
  {:else}
    <div id="chat-hint">Enter로 채팅</div>
  {/if}
</div>

<script lang="ts">
  import { chatMessages } from '$lib/stores/game';

  let chatLogEl: HTMLDivElement | undefined = $state();
  let atBottom = $state(true);

  function handleScroll() {
    if (!chatLogEl) return;
    atBottom = chatLogEl.scrollHeight - chatLogEl.scrollTop - chatLogEl.clientHeight < 10;
  }

  $effect(() => {
    // Track messages to trigger scroll
    const msgs = $chatMessages;
    if (atBottom && chatLogEl) {
      // Use tick-like delay to scroll after DOM update
      requestAnimationFrame(() => {
        if (chatLogEl) {
          chatLogEl.scrollTop = chatLogEl.scrollHeight;
        }
      });
    }
  });
</script>

<div id="chat-log" bind:this={chatLogEl} onscroll={handleScroll}>
  {#each $chatMessages as message, i (i)}
    {#if message.isSystem}
      <div class="chat-entry chat-system">{message.text}</div>
    {:else}
      <div class="chat-entry">
        <span class="chat-name">{message.nickname}</span>
        <span class="chat-text"> {message.text}</span>
      </div>
    {/if}
  {/each}
</div>

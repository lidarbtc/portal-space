<script lang="ts">
  import { network } from '$lib/network';
  import type { Emoji } from '$lib/types';
  import { Tooltip } from 'bits-ui';

  const emotes: { emoji: Emoji; label: string }[] = [
    { emoji: '👋', label: '인사' },
    { emoji: '☕', label: '커피' },
    { emoji: '🔥', label: '불꽃' },
    { emoji: '💻', label: '코딩' },
    { emoji: '📢', label: '확성기' },
  ];
</script>

<Tooltip.Provider delayDuration={300}>
  <div id="emote-bar">
    {#each emotes as emote (emote.emoji)}
      <Tooltip.Root>
        <Tooltip.Trigger onclick={() => network.sendEmote(emote.emoji)}>
          {emote.emoji}
        </Tooltip.Trigger>
        <Tooltip.Content class="emote-tooltip" sideOffset={8}>
          {emote.label}
        </Tooltip.Content>
      </Tooltip.Root>
    {/each}
  </div>
</Tooltip.Provider>

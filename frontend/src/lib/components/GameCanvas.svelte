<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Phaser from 'phaser';
  import { createGameConfig } from '$lib/game/config';
  import { players, selfId, addSystemMessage } from '$lib/stores/game';
  import type { OutgoingMessage } from '$lib/types';

  let { snapshot }: { snapshot: OutgoingMessage | null } = $props();

  let container: HTMLDivElement;
  let game: Phaser.Game | null = null;

  onMount(() => {
    // Initialize stores from snapshot data before creating game
    if (snapshot) {
      if (snapshot.self) {
        selfId.set(snapshot.self.id);
        const initial = new Map();
        initial.set(snapshot.self.id, snapshot.self);
        if (snapshot.players) {
          snapshot.players.forEach((p) => initial.set(p.id, p));
        }
        players.set(initial);
        addSystemMessage(snapshot.self.nickname + '님이 입장했습니다.');
      }
    }

    game = new Phaser.Game(createGameConfig(container));
  });

  onDestroy(() => {
    game?.destroy(true);
    game = null;
  });

  // HMR dispose hook — prevents canvas accumulation during dev
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      game?.destroy(true);
    });
  }
</script>

<div bind:this={container}></div>

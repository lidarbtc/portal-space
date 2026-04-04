<script lang="ts">
  import Lobby from '$lib/components/Lobby.svelte';
  import GameCanvas from '$lib/components/GameCanvas.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import EmoteBar from '$lib/components/EmoteBar.svelte';
  import ChatLog from '$lib/components/ChatLog.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import PlayerCount from '$lib/components/PlayerCount.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import { network } from '$lib/network';
  import { players, selfId } from '$lib/stores/game';
  import { get } from 'svelte/store';
  import type { OutgoingMessage } from '$lib/types';

  let inGame = $state(false);
  let gameData: OutgoingMessage | null = $state(null);

  function handleJoin(data: { nickname: string; avatar: number; snapshot: OutgoingMessage }) {
    gameData = data.snapshot;
    inGame = true;
  }

  function handleChatSend(text: string) {
    const id = get(selfId);
    if (!id) return;
    const currentPlayers = get(players);
    const self = currentPlayers.get(id);
    if (self) {
      network.sendChat(text, self.x, self.y);
    }
  }
</script>

{#if !inGame}
  <Lobby onJoin={handleJoin} />
{:else}
  <div id="game-container">
    <GameCanvas snapshot={gameData} />
  </div>
  <StatusBar />
  <EmoteBar />
  <ChatLog />
  <ChatInput onSend={handleChatSend} />
  <PlayerCount />
  <SettingsPanel />
{/if}

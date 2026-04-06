<script lang="ts">
  import Lobby from '$lib/components/Lobby.svelte';
  import GameCanvas from '$lib/components/GameCanvas.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import EmoteBar from '$lib/components/EmoteBar.svelte';
  import ChatLog from '$lib/components/ChatLog.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import PlayerCount from '$lib/components/PlayerCount.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import Joystick from '$lib/components/Joystick.svelte';
  import { network } from '$lib/network';
  import { players, selfId } from '$lib/stores/game';
  import { connectionState } from '$lib/stores/connection';
  import { isMobile } from '$lib/stores/mobile';
  import { get } from 'svelte/store';
  import type { OutgoingMessage } from '$lib/types';

  let inGame = $state(false);
  let gameData: OutgoingMessage | null = $state(null);

  // Lobby fallback: when connectionState becomes 'disconnected' while in game, return to lobby
  $effect(() => {
    if (inGame && $connectionState === 'disconnected') {
      inGame = false;
      gameData = null;
    }
  });

  function handleJoin(data: { nickname: string; avatar: number; snapshot: OutgoingMessage }) {
    gameData = data.snapshot;
    inGame = true;
    network.enableReconnect();
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
{:else if $isMobile}
  <div class="mobile-layout">
    <div class="mobile-header">
      <PlayerCount />
    </div>
    <div id="game-container" class="mobile-game">
      <GameCanvas snapshot={gameData} />
      <div class="mobile-joystick">
        <Joystick />
      </div>
    </div>
    <div class="mobile-chat">
      <ChatLog />
      <ChatInput onSend={handleChatSend} mobile={true} />
    </div>
  </div>
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

{#if inGame && $connectionState === 'reconnecting'}
  <div class="reconnect-overlay">
    <div class="reconnect-message">
      <span class="reconnect-spinner"></span>
      <span>재접속 중...</span>
    </div>
  </div>
{/if}

<style>
  .reconnect-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    pointer-events: none;
  }

  .reconnect-message {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #e0e0ff;
    font-size: 24px;
    font-family: 'MulmaruMono', monospace;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  }

  .reconnect-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(224, 224, 255, 0.3);
    border-top-color: #e0e0ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Mobile layout */
  .mobile-layout {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    width: 100vw;
    overflow: hidden;
  }

  .mobile-header {
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px;
  }

  .mobile-layout :global(#game-container) {
    flex: 1 1 auto;
    min-height: 0;
    height: auto;
  }

  .mobile-game {
    position: relative;
  }

  .mobile-joystick {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
  }

  .mobile-chat {
    flex: 0 0 auto;
    max-height: 150px;
    overflow-y: auto;
    border-top: 1px solid #0f3460;
  }

  .mobile-header :global(#player-count) {
    position: static;
  }
</style>

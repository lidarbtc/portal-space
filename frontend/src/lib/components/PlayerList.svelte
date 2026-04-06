<script lang="ts">
  import { players, selfId } from '$lib/stores/game';

  let openDropdown: 'online' | 'away' | 'dnd' | null = $state(null);

  const avatarColors = ['#06b6d4', '#4ade80', '#f472b6', '#fbbf24'];

  let onlinePlayers = $derived(
    [...$players.values()].filter((p) => p.status === 'online')
  );
  let awayPlayers = $derived(
    [...$players.values()].filter((p) => p.status === 'away')
  );
  let dndPlayers = $derived(
    [...$players.values()].filter((p) => p.status === 'dnd')
  );

  function toggle(group: 'online' | 'away' | 'dnd') {
    openDropdown = openDropdown === group ? null : group;
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.player-group')) {
      openDropdown = null;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="player-list">
  <div class="player-group">
    <button class="player-group-btn" onclick={() => toggle('online')}>
      <span class="group-indicator online"></span>
      <span>온라인 {onlinePlayers.length}</span>
    </button>
    {#if openDropdown === 'online'}
      <div class="player-dropdown">
        {#each onlinePlayers as player (player.id)}
          <div class="player-item" class:is-self={player.id === $selfId}>
            <span class="player-avatar-dot" style="background: {avatarColors[player.avatar ?? 0]}"></span>
            <span class="player-nickname">{player.nickname}</span>
          </div>
        {/each}
        {#if onlinePlayers.length === 0}
          <div class="player-item empty">없음</div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="player-group">
    <button class="player-group-btn" onclick={() => toggle('away')}>
      <span class="group-indicator away"></span>
      <span>자리비움 {awayPlayers.length}</span>
    </button>
    {#if openDropdown === 'away'}
      <div class="player-dropdown">
        {#each awayPlayers as player (player.id)}
          <div class="player-item" class:is-self={player.id === $selfId}>
            <span class="player-avatar-dot" style="background: {avatarColors[player.avatar ?? 0]}"></span>
            <span class="player-nickname">{player.nickname}</span>
          </div>
        {/each}
        {#if awayPlayers.length === 0}
          <div class="player-item empty">없음</div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="player-group">
    <button class="player-group-btn" onclick={() => toggle('dnd')}>
      <span class="group-indicator dnd"></span>
      <span>방해금지 {dndPlayers.length}</span>
    </button>
    {#if openDropdown === 'dnd'}
      <div class="player-dropdown">
        {#each dndPlayers as player (player.id)}
          <div class="player-item" class:is-self={player.id === $selfId}>
            <span class="player-avatar-dot" style="background: {avatarColors[player.avatar ?? 0]}"></span>
            <span class="player-nickname">{player.nickname}</span>
          </div>
        {/each}
        {#if dndPlayers.length === 0}
          <div class="player-item empty">없음</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

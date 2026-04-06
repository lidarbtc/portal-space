<script lang="ts">
  import { ToggleGroup } from 'bits-ui';
  import { currentStatus } from '$lib/stores/game';
  import { network } from '$lib/network';
  import type { PlayerStatus } from '$lib/types';

  const statuses: { key: PlayerStatus; label: string }[] = [
    { key: 'online', label: '🟢 온라인' },
    { key: 'away', label: '🚶 자리비움' },
    { key: 'dnd', label: '🚫 방해금지' },
  ];
</script>

<ToggleGroup.Root
  type="single"
  id="status-bar"
  value={$currentStatus}
  onValueChange={(value) => {
    if (value) {
      const status = value as PlayerStatus;
      currentStatus.set(status);
      network.sendStatus(status);
    }
  }}
>
  {#each statuses as { key, label } (key)}
    <ToggleGroup.Item value={key}>
      {label}
    </ToggleGroup.Item>
  {/each}
</ToggleGroup.Root>

<script lang="ts">
  import { volume, muted } from '$lib/stores/settings';
  import { notifyAudio } from '$lib/audio';
  import { Slider, Switch } from 'bits-ui';

  let open = $state(false);

  function toggle() {
    open = !open;
    if (open) notifyAudio.ensureContext();
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('#settings-btn, #settings-panel')) {
      open = false;
    }
  }

  // Volume as 0-100 integer for the slider
  let volumePercent = $derived(Math.round($volume * 100));
</script>

<svelte:window onclick={handleClickOutside} />

<button id="settings-btn" onclick={toggle} type="button">&#9881;</button>

{#if open}
  <div id="settings-panel">
    <h3>오디오 설정</h3>
    <div class="setting-row">
      <span>알림음 볼륨</span>
      <Slider.Root
        type="single"
        min={0}
        max={100}
        step={1}
        value={volumePercent}
        onValueChange={(v) => volume.set(v / 100)}
      >
        <Slider.Range />
        <Slider.Thumb index={0} />
      </Slider.Root>
    </div>
    <div class="setting-row">
      <span>음소거</span>
      <Switch.Root
        checked={$muted}
        onCheckedChange={(checked) => muted.set(checked)}
      >
        <Switch.Thumb />
      </Switch.Root>
    </div>
  </div>
{/if}

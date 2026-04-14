<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { get } from 'svelte/store';
  import { regionalChatSettingsOpen, currentRegionalChatId } from '$lib/stores/regional-chat';
  import { interactiveObjects } from '$lib/stores/objects';
  import { network } from '$lib/network';
  import { toast } from 'svelte-sonner';
  import type { RegionalChatState } from '$lib/types';

  let name = $state('');
  let radius = $state(128);
  let retainHistory = $state(false);

  let tileDisplay = $derived(Math.round(radius / 32));

  $effect(() => {
    if ($regionalChatSettingsOpen && $currentRegionalChatId) {
      const objectId = $currentRegionalChatId;
      const objects = get(interactiveObjects);
      const obj = objects.get(objectId);
      if (obj) {
        const state = obj.state as RegionalChatState | undefined;
        name = state?.name ?? '';
        radius = state?.radius ?? 128;
        retainHistory = state?.retainHistory ?? false;
      }
    }
  });

  function handleSave() {
    const objectId = $currentRegionalChatId;
    if (!objectId) return;
    network.sendRegionalChatAction(objectId, { name, radius, retainHistory });
    toast.success('결계석 설정이 저장되었습니다');
    regionalChatSettingsOpen.set(false);
  }

  function handleClose() {
    regionalChatSettingsOpen.set(false);
    currentRegionalChatId.set(null);
  }
</script>

<Dialog.Root
  bind:open={$regionalChatSettingsOpen}
  onOpenChange={(open) => { if (!open) handleClose(); }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="rcs-overlay" />
    <Dialog.Content class="rcs-content">
      <div class="rcs-header">
        <Dialog.Title class="rcs-title">결계석 설정</Dialog.Title>
        <button onclick={handleClose} class="rcs-close-btn">✕</button>
      </div>

      <div class="rcs-body">
        <label class="rcs-field">
          <span class="rcs-label">존 이름</span>
          <input
            type="text"
            bind:value={name}
            maxlength={20}
            class="rcs-input"
            placeholder="채팅 존 이름"
          />
        </label>

        <label class="rcs-field">
          <span class="rcs-label">반경 ({tileDisplay} 타일)</span>
          <input
            type="range"
            bind:value={radius}
            min={64}
            max={320}
            step={32}
            class="rcs-range"
          />
          <span class="rcs-range-labels">
            <span>2 타일</span>
            <span>10 타일</span>
          </span>
        </label>

        <label class="rcs-checkbox-field">
          <input type="checkbox" bind:checked={retainHistory} class="rcs-checkbox" />
          <span class="rcs-label">대화 이력 보존</span>
          <span class="rcs-note">(추후 지원 예정)</span>
        </label>
      </div>

      <div class="rcs-footer">
        <button onclick={handleSave} class="rcs-save-btn">저장</button>
      </div>

      <Dialog.Description class="rcs-sr-only">
        지역 채팅 존 설정 패널
      </Dialog.Description>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.rcs-overlay) {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.7);
  }

  :global(.rcs-content) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 201;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 24rem;
    border-radius: 12px;
    border: 1px solid rgba(6, 182, 212, 0.3);
    background: #1a1a2e;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }

  :global(.rcs-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(6, 182, 212, 0.2);
  }

  :global(.rcs-title) {
    font-family: 'MulmaruMono', monospace;
    font-size: 14px;
    color: #67e8f9;
    margin: 0;
  }

  :global(.rcs-close-btn) {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 16px;
  }
  :global(.rcs-close-btn:hover) {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  :global(.rcs-body) {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }

  :global(.rcs-field) {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  :global(.rcs-label) {
    font-family: 'MulmaruMono', monospace;
    font-size: 12px;
    color: #67e8f9;
  }

  :global(.rcs-input) {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(6, 182, 212, 0.3);
    border-radius: 6px;
    padding: 8px 12px;
    color: #e0e0ff;
    font-family: 'MulmaruMono', monospace;
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
  }
  :global(.rcs-input:focus) {
    border-color: var(--color-primary);
  }
  :global(.rcs-input::placeholder) {
    color: #4b5563;
  }

  :global(.rcs-range) {
    width: 100%;
    accent-color: var(--color-primary);
  }

  :global(.rcs-range-labels) {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #6b7280;
    font-family: 'MulmaruMono', monospace;
  }

  :global(.rcs-checkbox-field) {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.rcs-checkbox) {
    accent-color: var(--color-primary);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  :global(.rcs-note) {
    font-size: 11px;
    color: #6b7280;
    font-family: 'MulmaruMono', monospace;
  }

  :global(.rcs-footer) {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid rgba(6, 182, 212, 0.2);
  }

  :global(.rcs-save-btn) {
    font-family: 'MulmaruMono', monospace;
    font-size: 13px;
    padding: 8px 20px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    background: var(--color-primary);
    color: #0a0a1a;
    font-weight: bold;
    transition: background 0.2s;
  }
  :global(.rcs-save-btn:hover) {
    background: var(--color-primary-hover);
  }

  :global(.rcs-sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>

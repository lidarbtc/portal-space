<script lang="ts">
	import { Dialog } from 'bits-ui'
	import { network } from '$lib/network'
	import { currentCustomStatus } from '$lib/stores/game'
	import { MAX_CUSTOM_STATUS_LEN } from '$lib/types'

	let { open = $bindable(false) }: { open: boolean } = $props()

	let statusInput = $state('')

	$effect(() => {
		if (open) {
			statusInput = $currentCustomStatus
		}
	})

	function handleSave() {
		const trimmed = statusInput.trim()
		currentCustomStatus.set(trimmed)
		network.sendCustomStatus(trimmed)
		open = false
	}

	function handleClear() {
		currentCustomStatus.set('')
		network.sendCustomStatus('')
		open = false
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="custom-status-overlay" />
		<Dialog.Content class="custom-status-content">
			<Dialog.Title class="custom-status-title">상태 설정</Dialog.Title>

			<div class="custom-status-body">
				<div class="field-group">
					<label class="field-label" for="custom-status-input">상태 메시지</label>
					<input
						id="custom-status-input"
						type="text"
						class="status-input"
						placeholder="상태 메시지 입력"
						maxlength={MAX_CUSTOM_STATUS_LEN}
						bind:value={statusInput}
						onkeydown={(e) => {
							if (e.key === 'Enter') handleSave()
						}}
					/>
					<span class="char-count">{statusInput.length}/{MAX_CUSTOM_STATUS_LEN}</span>
				</div>

				<div class="button-row">
					<button class="save-btn" onclick={handleSave}>저장</button>
					<button class="clear-btn" onclick={handleClear}>삭제</button>
				</div>
			</div>

			<Dialog.Close class="custom-status-close">✕</Dialog.Close>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.custom-status-overlay) {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.6);
	}

	:global(.custom-status-content) {
		position: fixed;
		left: 50%;
		top: 50%;
		z-index: 201;
		transform: translate(-50%, -50%);
		background: rgba(16, 24, 48, 0.97);
		border: 1px solid #0f3460;
		border-radius: 12px;
		width: 360px;
		max-width: calc(100vw - 32px);
		padding: 24px;
		font-family: 'MulmaruMono', monospace;
		color: #e0e0ff;
	}

	:global(.custom-status-title) {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 16px 0;
		color: #e0e0ff;
	}

	:global(.custom-status-close) {
		all: unset;
		position: absolute;
		top: 12px;
		right: 16px;
		cursor: pointer;
		color: #aaaacc;
		font-size: 18px;
		padding: 4px 8px;
		border-radius: 4px;
		transition:
			color 0.2s,
			background 0.2s;
	}

	:global(.custom-status-close:hover) {
		color: #e0e0ff;
		background: var(--color-primary-alpha-50);
	}

	.custom-status-body {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.field-label {
		font-size: 12px;
		color: #aaaacc;
		font-weight: 500;
	}

	.status-input {
		width: 100%;
		padding: 8px 12px;
		background: #16213e;
		border: 2px solid #0f3460;
		border-radius: 8px;
		color: #e0e0ff;
		font-size: 14px;
		font-family: 'MulmaruMono', monospace;
		outline: none;
		transition: border-color 0.2s;
		box-sizing: border-box;
	}

	.status-input:focus {
		border-color: var(--color-primary);
	}

	.status-input::placeholder {
		color: #555580;
	}

	.char-count {
		font-size: 11px;
		color: #555580;
		text-align: right;
	}

	.button-row {
		display: flex;
		gap: 8px;
	}

	.save-btn {
		all: unset;
		cursor: pointer;
		padding: 8px 24px;
		background: var(--color-primary);
		color: #e0e0ff;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'MulmaruMono', monospace;
		font-weight: 500;
		transition: background 0.2s;
		user-select: none;
	}

	.save-btn:hover {
		background: var(--color-primary-hover);
	}

	.clear-btn {
		all: unset;
		cursor: pointer;
		padding: 8px 24px;
		background: transparent;
		color: #aaaacc;
		border: 1px solid #0f3460;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'MulmaruMono', monospace;
		font-weight: 500;
		transition:
			background 0.2s,
			color 0.2s;
		user-select: none;
	}

	.clear-btn:hover {
		background: var(--color-primary-alpha-30);
		color: #e0e0ff;
	}
</style>

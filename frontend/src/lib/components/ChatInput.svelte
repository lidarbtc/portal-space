<script lang="ts">
	import { onMount } from 'svelte'
	import { useEventListener } from 'runed'
	import { gameState } from '$lib/stores/game.svelte'
	import { MAX_CHAT_IMAGE_BYTES } from '$lib/types'
	import { regionalChatState } from '$lib/stores/regional-chat.svelte'

	let {
		onSend,
		onSendImage,
		mobile = false,
		alwaysActive = false,
	}: {
		onSend: (text: string) => void
		onSendImage: (file: File, text?: string) => void | Promise<void>
		mobile?: boolean
		alwaysActive?: boolean
	} = $props()

	let inputEl: HTMLInputElement | undefined = $state()
	let fileInputEl: HTMLInputElement | undefined = $state()
	let inputValue = $state('')
	let imageError = $state('')
	let isSendingImage = $state(false)

	const MAX_CHAT_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024

	let isInZone = $derived(!!regionalChatState.currentZoneId)
	let isRegionalTab = $derived(regionalChatState.activeChatTab === 'regional')
	let isReadOnly = $derived(isInZone && !isRegionalTab)

	onMount(() => {
		if (mobile) {
			gameState.chatInputActive = true
		}
	})

	function handleFocus() {
		gameState.chatInputActive = true
	}

	function handleBlur() {
		if (!mobile) {
			gameState.chatInputActive = false
		}
	}

	useEventListener(
		() => document,
		'keydown',
		(e: KeyboardEvent) => {
			if (!alwaysActive) return
			if (e.key !== 'j' && e.key !== 'J') return
			if (e.ctrlKey || e.metaKey || e.altKey) return
			const el = document.activeElement
			if (
				el?.tagName === 'INPUT' ||
				el?.tagName === 'TEXTAREA' ||
				(el as HTMLElement)?.isContentEditable
			)
				return
			e.preventDefault()
			inputEl?.focus()
		},
	)

	function showInput() {
		gameState.chatInputActive = true
		requestAnimationFrame(() => {
			inputEl?.focus()
		})
	}

	function hideInput() {
		inputValue = ''
		imageError = ''
		if (alwaysActive) {
			inputEl?.blur()
		} else if (!mobile) {
			gameState.chatInputActive = false
		}
	}

	function sendMessage() {
		if (isSendingImage) return
		const text = inputValue.trim()
		if (text) {
			onSend(text)
		}
		inputValue = ''
		if (mobile) {
			inputEl?.blur()
		} else if (alwaysActive) {
			// Keep input active, just clear the value
		} else {
			hideInput()
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		e.stopPropagation()
		if (e.key === 'Enter' && !e.isComposing) {
			sendMessage()
		} else if (e.key === 'Escape') {
			hideInput()
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (mobile || alwaysActive) return
		if (e.key === 'Enter' && !gameState.chatInputActive) {
			e.preventDefault()
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur()
			}
			showInput()
		}
	}

	function openImagePicker() {
		imageError = ''
		if (fileInputEl) {
			fileInputEl.value = ''
			fileInputEl.click()
		}
	}

	async function handleFileChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement | null
		const file = target?.files?.[0]
		if (!file) return

		imageError = ''

		if (!file.type.startsWith('image/')) {
			imageError = '이미지 파일만 전송할 수 있습니다.'
			target.value = ''
			return
		}

		if (file.type === 'image/gif' && file.size > MAX_CHAT_IMAGE_BYTES) {
			imageError = 'GIF 이미지는 2MB 이하만 전송할 수 있습니다.'
			target.value = ''
			return
		}

		if (file.type !== 'image/gif' && file.size > MAX_CHAT_IMAGE_SOURCE_BYTES) {
			imageError = '이미지는 원본 10MB 이하 파일만 업로드할 수 있습니다.'
			target.value = ''
			return
		}

		isSendingImage = true
		try {
			const text = inputValue.trim()
			await onSendImage(file, text || undefined)
			inputValue = ''
			if (mobile) {
				inputEl?.blur()
			}
		} catch (error) {
			imageError = error instanceof Error ? error.message : '이미지 전송에 실패했습니다.'
		} finally {
			isSendingImage = false
			target.value = ''
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div id="chat-container" class:mobile>
	{#if mobile || alwaysActive || gameState.chatInputActive}
		<div class="chat-input-row">
			<button
				class="chat-attach-btn"
				type="button"
				onclick={openImagePicker}
				aria-label="이미지 업로드"
				disabled={isSendingImage}
			>
				🖼
			</button>
			<input
				bind:this={fileInputEl}
				class="sr-only-file-input"
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				onchange={handleFileChange}
			/>
			{#if isInZone && isRegionalTab}
				<span class="zone-badge">{regionalChatState.currentZoneName}</span>
			{/if}
			{#if isReadOnly}
				<div class="chat-readonly-indicator">(읽기 전용)</div>
			{:else}
				<input
					id="chat-input"
					type="text"
					placeholder={alwaysActive ? '메시지를 입력해주세요 (J)' : '메시지 입력...'}
					maxlength={500}
					bind:this={inputEl}
					bind:value={inputValue}
					onkeydown={handleKeydown}
					onfocus={handleFocus}
					onblur={handleBlur}
					disabled={isSendingImage}
				/>
			{/if}
			{#if mobile}
				<button
					class="chat-send-btn"
					onclick={sendMessage}
					aria-label="전송"
					disabled={isSendingImage}>↑</button
				>
			{/if}
		</div>
		{#if isSendingImage}
			<div class="chat-upload-status">이미지 처리 중...</div>
		{:else if imageError}
			<div class="chat-upload-error">{imageError}</div>
		{/if}
	{:else}
		<div id="chat-hint">Enter로 채팅</div>
	{/if}
</div>

<style>
	.chat-input-row {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.mobile .chat-input-row {
		padding: 6px 8px;
	}

	.mobile :global(#chat-input) {
		flex: 1;
	}

	.chat-send-btn,
	.chat-attach-btn {
		flex: 0 0 auto;
		width: 36px;
		height: 36px;
		border: 2px solid #0f3460;
		border-radius: 6px;
		background: var(--color-primary);
		color: #e0e0ff;
		font-size: 1.1rem;
		font-family: 'MulmaruMono', monospace;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		-webkit-tap-highlight-color: transparent;
	}

	.chat-send-btn:disabled,
	.chat-attach-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.sr-only-file-input {
		display: none;
	}

	.chat-upload-status,
	.chat-upload-error {
		margin-top: 6px;
		font-size: 0.75rem;
		font-family: 'MulmaruMono', monospace;
	}

	.chat-upload-status {
		color: #ccccdd;
	}

	.chat-upload-error {
		color: #ff9aa2;
	}

	.chat-send-btn:active,
	.chat-attach-btn:active {
		background: var(--color-primary-hover);
	}

	.zone-badge {
		flex: 0 0 auto;
		font-family: 'MulmaruMono', monospace;
		font-size: 0.6875rem;
		padding: 2px 8px;
		border-radius: 4px;
		background: rgba(102, 204, 255, 0.15);
		color: #66ccff;
		border: 1px solid rgba(102, 204, 255, 0.3);
		white-space: nowrap;
	}

	.chat-readonly-indicator {
		flex: 1;
		font-family: 'MulmaruMono', monospace;
		font-size: 0.8125rem;
		color: #666677;
		padding: 6px 10px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
	}
</style>

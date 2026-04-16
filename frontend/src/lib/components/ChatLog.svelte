<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity'
	import { onDestroy } from 'svelte'
	import { gameState } from '$lib/stores/game.svelte'
	import type { ChatImage, ChatMessage } from '$lib/types'
	import { regionalChatState } from '$lib/stores/regional-chat.svelte'
	import type { ChatChannel } from '$lib/types'
	import { parseTextWithUrls } from '$lib/utils/linkify'
	import { AlertDialog } from 'bits-ui'

	let chatLogEl: HTMLDivElement | undefined = $state()
	let atBottom = $state(true)
	let openLinkDialog = $state(false)
	let pendingUrl = $state('')
	const chatImageUrls = new SvelteMap<ChatImage, string>()

	function base64ToBlob(data: string, mime: string): Blob {
		const binary = atob(data)
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
		return new Blob([bytes], { type: mime })
	}

	function ensureChatImageUrl(image: ChatImage): string {
		const existingUrl = chatImageUrls.get(image)
		if (existingUrl) {
			return existingUrl
		}

		const objectUrl = URL.createObjectURL(base64ToBlob(image.data, image.mime))
		chatImageUrls.set(image, objectUrl)
		return objectUrl
	}

	function syncChatImageUrls(messages: ChatMessage[]) {
		const activeImages = new SvelteSet<ChatImage>()

		for (const message of messages) {
			if (!message.image) continue
			activeImages.add(message.image)
			ensureChatImageUrl(message.image)
		}

		for (const [image, objectUrl] of chatImageUrls) {
			if (activeImages.has(image)) continue
			URL.revokeObjectURL(objectUrl)
			chatImageUrls.delete(image)
		}
	}

	let displayMessages = $derived(
		regionalChatState.activeChatTab === 'regional' && regionalChatState.currentZoneId
			? regionalChatState.regionalMessages
			: gameState.chatMessages,
	)

	function switchTab(tab: ChatChannel) {
		regionalChatState.activeChatTab = tab
	}

	function formatTime(ts: number): string {
		const d = new Date(ts)
		return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}]`
	}

	function handleLinkClick(e: MouseEvent, url: string) {
		e.preventDefault()
		pendingUrl = url
		openLinkDialog = true
	}

	function handleConfirm() {
		window.open(pendingUrl, '_blank', 'noopener,noreferrer')
		openLinkDialog = false
	}

	function handleScroll() {
		if (!chatLogEl) return
		atBottom = chatLogEl.scrollHeight - chatLogEl.scrollTop - chatLogEl.clientHeight < 10
	}

	function scrollToBottom() {
		if (!atBottom || !chatLogEl) return

		requestAnimationFrame(() => {
			if (chatLogEl) {
				chatLogEl.scrollTop = chatLogEl.scrollHeight
			}
		})
	}

	$effect(() => {
		syncChatImageUrls(gameState.chatMessages)
	})

	$effect(() => {
		void displayMessages
		scrollToBottom()
	})

	onDestroy(() => {
		for (const objectUrl of chatImageUrls.values()) {
			URL.revokeObjectURL(objectUrl)
		}
		chatImageUrls.clear()
	})
</script>

<div class="chat-tab-bar">
	<button
		class="chat-tab"
		class:active={regionalChatState.activeChatTab === 'global'}
		onclick={() => switchTab('global')}
	>
		Global
	</button>
	{#if regionalChatState.currentZoneId}
		<button
			class="chat-tab"
			class:active={regionalChatState.activeChatTab === 'regional'}
			onclick={() => switchTab('regional')}
		>
			{regionalChatState.currentZoneName ?? 'Regional'}
		</button>
	{/if}
</div>

<div id="chat-log" bind:this={chatLogEl} onscroll={handleScroll}>
	{#each displayMessages as message, i (i)}
		{#if message.isSystem}
			<div class="chat-entry chat-system">
				<span class="chat-time">{formatTime(message.timestamp)}</span><span class="chat-system-text"
					>{#each parseTextWithUrls(message.text ?? '') as segment, j (j)}{#if segment.type === 'url'}<a
								href={segment.value}
								target="_blank"
								rel="noopener noreferrer"
								onclick={(e) => handleLinkClick(e, segment.value)}>{segment.value}</a
							>{:else}{segment.value}{/if}{/each}</span
				>
			</div>
		{:else}
			<div class="chat-entry">
				<span class="chat-time">{formatTime(message.timestamp)}</span><span
					class="chat-name"
					style:color={message.nicknameColor ?? undefined}>{message.nickname}</span
				>
				{#if message.text}
					<span class="chat-text">
						{#each parseTextWithUrls(message.text) as segment, j (j)}{#if segment.type === 'url'}<a
									href={segment.value}
									target="_blank"
									rel="noopener noreferrer"
									onclick={(e) => handleLinkClick(e, segment.value)}>{segment.value}</a
								>{:else}{segment.value}{/if}{/each}</span
					>
				{/if}
				{#if message.image}
					<div class="chat-image-message">
						<img
							class="chat-image"
							src={ensureChatImageUrl(message.image)}
							alt={message.image.name ?? 'shared image'}
							loading="lazy"
							onload={() => {
								if (atBottom) {
									scrollToBottom()
								}
							}}
						/>
						{#if message.image.name}
							<span class="chat-image-name">{message.image.name}</span>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{/each}
</div>

<AlertDialog.Root bind:open={openLinkDialog}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="link-dialog-overlay" />
		<AlertDialog.Content class="link-dialog-content">
			<AlertDialog.Title class="link-dialog-title">외부 사이트로 이동</AlertDialog.Title>
			<AlertDialog.Description class="link-dialog-desc">
				다음 링크를 열겠습니까?
			</AlertDialog.Description>
			<p class="link-dialog-url">{pendingUrl}</p>
			<div class="link-dialog-actions">
				<AlertDialog.Cancel class="link-dialog-btn link-dialog-cancel">취소</AlertDialog.Cancel>
				<AlertDialog.Action class="link-dialog-btn link-dialog-confirm" onclick={handleConfirm}
					>열기</AlertDialog.Action
				>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>

<style>
	.chat-tab-bar {
		display: flex;
		gap: 0;
		padding: 0 4px;
		background: transparent;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	.chat-tab {
		font-family: 'MulmaruMono', monospace;
		font-size: 0.75rem;
		padding: 6px 12px;
		border: none;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		background: transparent;
		color: #888899;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
		margin-bottom: -1px;
	}

	.chat-tab:hover {
		color: #ccccdd;
		border-bottom-color: rgba(255, 255, 255, 0.2);
	}

	.chat-tab.active {
		color: #e0e0ff;
		border-bottom-color: var(--color-primary);
		font-weight: bold;
	}

	:global(.link-dialog-overlay) {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.6);
	}

	:global(.link-dialog-content) {
		position: fixed;
		left: 50%;
		top: 50%;
		z-index: 201;
		transform: translate(-50%, -50%);
		background: rgba(16, 24, 48, 0.95);
		border: none;
		border-radius: 8px;
		padding: 20px;
		width: 360px;
		max-width: calc(100% - 32px);
		font-family: 'MulmaruMono', monospace;
	}

	:global(.link-dialog-title) {
		color: #e0e0ff;
		font-size: 1.125rem;
		font-weight: bold;
		margin-bottom: 8px;
	}

	:global(.link-dialog-desc) {
		color: #888899;
		font-size: 0.875rem;
		margin-bottom: 8px;
	}

	:global(.link-dialog-url) {
		color: #66ccff;
		font-size: 0.8125rem;
		word-break: break-all;
		background: rgba(0, 0, 0, 0.3);
		padding: 8px;
		border-radius: 4px;
		margin-bottom: 16px;
	}

	:global(.link-dialog-actions) {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	:global(.link-dialog-btn) {
		font-family: 'MulmaruMono', monospace;
		font-size: 0.875rem;
		padding: 6px 16px;
		border-radius: 4px;
		border: none;
		cursor: pointer;
		transition: background 0.15s;
	}

	:global(.link-dialog-cancel) {
		background: rgba(255, 255, 255, 0.1);
		color: #ccccdd;
	}

	:global(.link-dialog-cancel:hover) {
		background: rgba(255, 255, 255, 0.15);
	}

	:global(.link-dialog-confirm) {
		background: var(--color-primary);
		color: #0a0a1a;
		font-weight: bold;
	}

	:global(.link-dialog-confirm:hover) {
		background: var(--color-primary-hover);
	}

	#chat-log {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.chat-entry {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 4px;
	}

	.chat-image-message {
		display: flex;
		flex: 0 0 100%;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		margin-left: 4px;
		max-width: min(240px, 100%);
	}

	.chat-image {
		display: block;
		width: auto;
		height: auto;
		align-self: flex-start;
		max-width: 100%;
		max-height: 200px;
		object-fit: contain;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(0, 0, 0, 0.2);
	}

	.chat-image-name {
		color: #888899;
		font-size: 0.75rem;
		word-break: break-all;
	}
</style>

<script lang="ts">
	import Lobby from '$lib/components/Lobby.svelte'
	import GameCanvas from '$lib/components/GameCanvas.svelte'
	import ActionBar from '$lib/components/ActionBar.svelte'
	import SettingsModal from '$lib/components/SettingsModal.svelte'
	import Whiteboard from '$lib/components/Whiteboard.svelte'
	import RegionalChatSettings from '$lib/components/RegionalChatSettings.svelte'
	import ChatLog from '$lib/components/ChatLog.svelte'
	import ChatInput from '$lib/components/ChatInput.svelte'

	import PlayerList from '$lib/components/PlayerList.svelte'

	import Joystick from '$lib/components/Joystick.svelte'
	import { network } from '$lib/network'
	import { gameState } from '$lib/stores/game.svelte'
	import { connectionState } from '$lib/stores/connection.svelte'
	import { IsMobile } from '$lib/hooks/is-mobile.svelte'

	const isMobile = new IsMobile()
	import { modalState } from '$lib/stores/modal.svelte'
	import { MAX_CHAT_IMAGE_BYTES, type OutgoingMessage, type ColorPalette } from '$lib/types'

	let inGame = $state(false)
	let gameData: OutgoingMessage | null = $state(null)
	let isWideDesktop = $state(false)
	// settingsOpen is now managed by the global settingsModalOpen store

	const MAX_CHAT_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024
	const TARGET_CHAT_IMAGE_BYTES = Math.floor(MAX_CHAT_IMAGE_BYTES * 0.8)
	const CHAT_IMAGE_MAX_LONG_EDGE = 1600
	const CHAT_IMAGE_DEFAULT_QUALITY = 0.78

	$effect(() => {
		if (isMobile.current) {
			isWideDesktop = false
			return
		}
		const mql = window.matchMedia('(min-width: 960px)')
		isWideDesktop = mql.matches
		const handler = (e: MediaQueryListEvent) => {
			isWideDesktop = e.matches
		}
		mql.addEventListener('change', handler)
		return () => mql.removeEventListener('change', handler)
	})

	// Lobby fallback: when connectionState becomes 'disconnected' while in game, return to lobby
	$effect(() => {
		if (inGame && connectionState.state === 'disconnected') {
			inGame = false
			gameData = null
		}
	})

	function handleJoin(data: { nickname: string; colors: ColorPalette; snapshot: OutgoingMessage }) {
		gameData = data.snapshot
		inGame = true
		network.enableReconnect()
	}

	function handleChatSend(text: string) {
		const id = gameState.selfId
		if (!id) return
		const self = gameState.players.get(id)
		if (self) {
			network.sendChat(text, self.x, self.y)
		}
	}

	function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => {
				const result = reader.result
				if (typeof result !== 'string') {
					reject(new Error('이미지를 읽지 못했습니다.'))
					return
				}

				const commaIndex = result.indexOf(',')
				if (commaIndex === -1) {
					reject(new Error('잘못된 이미지 데이터입니다.'))
					return
				}

				resolve(result.slice(commaIndex + 1))
			}
			reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
			reader.readAsDataURL(file)
		})
	}

	function loadImageElement(file: File): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const imageUrl = URL.createObjectURL(file)
			const image = new Image()

			image.onload = () => {
				URL.revokeObjectURL(imageUrl)
				resolve(image)
			}

			image.onerror = () => {
				URL.revokeObjectURL(imageUrl)
				reject(new Error('이미지를 읽지 못했습니다.'))
			}

			image.src = imageUrl
		})
	}

	function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
		return new Promise((resolve, reject) => {
			canvas.toBlob(
				(blob) => {
					if (!blob) {
						reject(new Error('이미지 변환에 실패했습니다.'))
						return
					}

					resolve(blob)
				},
				type,
				quality,
			)
		})
	}

	function getResizedDimensions(width: number, height: number, maxLongEdge: number) {
		const longEdge = Math.max(width, height)
		if (longEdge <= maxLongEdge) {
			return { width, height }
		}

		const scale = maxLongEdge / longEdge
		return {
			width: Math.max(1, Math.round(width * scale)),
			height: Math.max(1, Math.round(height * scale)),
		}
	}

	function withExtension(name: string, extension: string) {
		const sanitizedExtension = extension.startsWith('.') ? extension : `.${extension}`
		if (!name.includes('.')) {
			return `${name}${sanitizedExtension}`
		}

		return name.replace(/\.[^.]+$/, sanitizedExtension)
	}

	function createProcessedImageFile(blob: Blob, originalFile: File): File {
		const mime = blob.type || 'image/webp'
		const extension = mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp'

		return new File([blob], withExtension(originalFile.name, extension), {
			type: mime,
			lastModified: originalFile.lastModified,
		})
	}

	async function compressChatRasterImage(file: File): Promise<File> {
		const image = await loadImageElement(file)
		const baseDimensions = getResizedDimensions(
			image.naturalWidth,
			image.naturalHeight,
			CHAT_IMAGE_MAX_LONG_EDGE,
		)
		const canvas = document.createElement('canvas')
		const context = canvas.getContext('2d')

		if (!context) {
			throw new Error('이미지 압축을 초기화하지 못했습니다.')
		}

		const qualitySteps = [CHAT_IMAGE_DEFAULT_QUALITY, 0.7, 0.62, 0.54, 0.46]
		let bestBlob: Blob | null = null
		let bestAcceptedBlob: Blob | null = null
		let scale = 1

		for (let attempt = 0; attempt < 6; attempt += 1) {
			const width = Math.max(1, Math.round(baseDimensions.width * scale))
			const height = Math.max(1, Math.round(baseDimensions.height * scale))

			canvas.width = width
			canvas.height = height
			context.clearRect(0, 0, width, height)
			context.drawImage(image, 0, 0, width, height)

			for (const quality of qualitySteps) {
				const blob = await canvasToBlob(canvas, 'image/webp', quality)

				if (!bestBlob || blob.size < bestBlob.size) {
					bestBlob = blob
				}

				if (
					blob.size <= MAX_CHAT_IMAGE_BYTES &&
					(!bestAcceptedBlob || blob.size < bestAcceptedBlob.size)
				) {
					bestAcceptedBlob = blob
				}

				if (blob.size <= TARGET_CHAT_IMAGE_BYTES) {
					return createProcessedImageFile(blob, file)
				}
			}

			scale *= 0.85
		}

		const finalBlob = bestAcceptedBlob ?? bestBlob
		if (!finalBlob || finalBlob.size > MAX_CHAT_IMAGE_BYTES) {
			throw new Error('이미지를 2MB 이하로 압축하지 못했습니다.')
		}

		return createProcessedImageFile(finalBlob, file)
	}

	async function preprocessChatImage(file: File): Promise<File> {
		if (file.type === 'image/gif') {
			if (file.size > MAX_CHAT_IMAGE_BYTES) {
				throw new Error('GIF 이미지는 2MB 이하만 전송할 수 있습니다.')
			}

			return file
		}

		if (file.size > MAX_CHAT_IMAGE_SOURCE_BYTES) {
			throw new Error('이미지는 원본 10MB 이하 파일만 업로드할 수 있습니다.')
		}

		return compressChatRasterImage(file)
	}

	async function handleChatImageSend(file: File, text?: string) {
		const id = gameState.selfId
		if (!id) throw new Error('플레이어 정보를 찾을 수 없습니다.')

		if (!file.type.startsWith('image/')) {
			throw new Error('이미지 파일만 전송할 수 있습니다.')
		}

		const self = gameState.players.get(id)
		if (!self) throw new Error('내 플레이어 정보를 찾을 수 없습니다.')

		const processedFile = await preprocessChatImage(file)
		if (processedFile.size > MAX_CHAT_IMAGE_BYTES) {
			throw new Error('이미지는 2MB 이하만 전송할 수 있습니다.')
		}

		const data = await fileToBase64(processedFile)
		network.sendChatMessage(self.x, self.y, text, {
			mime: processedFile.type,
			name: processedFile.name,
			size: processedFile.size,
			data,
		})
	}
</script>

{#if !inGame}
	<Lobby onJoin={handleJoin} />
{:else if isMobile.current}
	<div class="mobile-layout">
		<div class="mobile-header">
			<button class="mobile-settings-btn" onclick={() => (modalState.settingsOpen = true)}>
				⚙
			</button>
		</div>
		<div id="game-container" class="mobile-game">
			<GameCanvas snapshot={gameData} />
			<Joystick />
		</div>
		<div class="mobile-chat">
			<ChatLog />
			<ChatInput onSend={handleChatSend} onSendImage={handleChatImageSend} mobile={true} />
		</div>
	</div>
{:else if isWideDesktop}
	<div class="desktop-layout">
		<div class="game-area">
			<div id="game-container">
				<GameCanvas snapshot={gameData} />
			</div>
			<ActionBar onOpenSettings={() => (modalState.settingsOpen = true)} />
		</div>
		<div class="chat-panel">
			<PlayerList />
			<ChatLog />
			<ChatInput onSend={handleChatSend} onSendImage={handleChatImageSend} alwaysActive={true} />
		</div>
	</div>
{:else}
	<div id="game-container">
		<GameCanvas snapshot={gameData} />
	</div>
	<ActionBar onOpenSettings={() => (modalState.settingsOpen = true)} />
	<ChatLog />
	<ChatInput onSend={handleChatSend} onSendImage={handleChatImageSend} />
{/if}

{#if inGame}
	<SettingsModal bind:open={modalState.settingsOpen} />
	<Whiteboard />
	<RegionalChatSettings />
{/if}

{#if inGame && connectionState.state === 'reconnecting'}
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
		height: 100%;
		width: 100%;
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

	.mobile-chat {
		flex: 0 0 auto;
		max-height: 150px;
		display: flex;
		flex-direction: column;
		border-top: 1px solid #0f3460;
	}

	.mobile-chat :global(#chat-log) {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}

	.mobile-chat :global(#chat-container) {
		flex-shrink: 0;
	}

	.mobile-header :global(#player-count) {
		position: static;
	}

	.mobile-settings-btn {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: rgba(16, 24, 48, 0.9);
		color: #aaaacc;
		font-size: 20px;
		transition:
			color 0.2s,
			background 0.2s;
	}

	.mobile-settings-btn:hover {
		color: #e0e0ff;
		background: var(--color-primary-alpha-50);
	}
</style>

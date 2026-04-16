<script lang="ts">
	import { Dialog, Slider, Switch } from 'bits-ui'
	import { User, Volume2 } from '@lucide/svelte'
	import { toast } from 'svelte-sonner'
	import { network } from '$lib/network'
	import { DEFAULT_COLORS } from '$lib/game/palette-swap'
	import { settingsState } from '$lib/stores/settings.svelte'
	import type { ColorPalette } from '$lib/types'
	import { PersistedState } from 'runed'
	import ColorCustomizer from './ColorCustomizer.svelte'

	let { open = $bindable(false) }: { open: boolean } = $props()

	type Section = 'profile' | 'audio'
	let activeSection: Section = $state('profile')

	const persistedNickname = new PersistedState('portal-nickname', '')
	const persistedBodyColor = new PersistedState('portal-color-body', DEFAULT_COLORS.body)
	const persistedEyeColor = new PersistedState('portal-color-eye', DEFAULT_COLORS.eye)
	const persistedFootColor = new PersistedState('portal-color-foot', DEFAULT_COLORS.foot)

	let nicknameInput = $state('')
	let nicknameError = $state('')

	// Sync nickname when modal opens
	$effect(() => {
		if (open) {
			nicknameInput = persistedNickname.current
			nicknameError = ''
		}
	})

	let volumePercent = $derived(Math.round(settingsState.volume * 100))

	function getCurrentColors(): ColorPalette {
		return {
			body: persistedBodyColor.current,
			eye: persistedEyeColor.current,
			foot: persistedFootColor.current,
		}
	}

	function handleApplyProfile() {
		const trimmed = nicknameInput.trim()
		if (!trimmed) {
			nicknameError = '닉네임을 입력해주세요.'
			return
		}
		if (trimmed.length > 20) {
			nicknameError = '닉네임은 20자 이하로 입력해주세요.'
			return
		}
		nicknameError = ''
		persistedNickname.current = trimmed
		const colors = getCurrentColors()
		const sent = network.sendProfile(trimmed, colors)
		if (sent) {
			toast.success('프로필이 적용되었습니다')
		} else {
			toast.error('연결이 끊겨 적용할 수 없습니다')
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="settings-overlay" />
		<Dialog.Content class="settings-content">
			<div class="settings-layout">
				<nav class="settings-sidebar">
					<Dialog.Title class="settings-title">설정</Dialog.Title>
					<button
						class="sidebar-item"
						class:active={activeSection === 'profile'}
						onclick={() => (activeSection = 'profile')}
					>
						<User size={18} />
						<span>프로필</span>
					</button>
					<button
						class="sidebar-item"
						class:active={activeSection === 'audio'}
						onclick={() => (activeSection = 'audio')}
					>
						<Volume2 size={18} />
						<span>오디오</span>
					</button>
				</nav>

				<div class="settings-body">
					{#if activeSection === 'profile'}
						<div class="section">
							<h3 class="section-heading">프로필</h3>

							<div class="field-group">
								<label class="field-label" for="settings-nickname">닉네임</label>
								<div class="nickname-row">
									<input
										id="settings-nickname"
										type="text"
										class="nickname-input"
										placeholder="닉네임 입력"
										maxlength={20}
										bind:value={nicknameInput}
									/>
								</div>
								{#if nicknameError}
									<p class="field-error">{nicknameError}</p>
								{/if}
							</div>

							<div class="field-group">
								<label class="field-label">캐릭터 색상</label>
								<ColorCustomizer
									bind:bodyColor={persistedBodyColor.current}
									bind:eyeColor={persistedEyeColor.current}
									bind:footColor={persistedFootColor.current}
								/>
							</div>

							<button class="apply-btn" onclick={handleApplyProfile}> 적용 </button>
						</div>
					{:else if activeSection === 'audio'}
						<div class="section">
							<h3 class="section-heading">오디오</h3>

							<div class="field-group">
								<label class="field-label">볼륨</label>
								<div class="audio-row">
									<Slider.Root
										type="single"
										min={0}
										max={100}
										step={1}
										value={volumePercent}
										onValueChange={(v) => (settingsState.volume = v / 100)}
										class="volume-slider"
									>
										<Slider.Range class="volume-range" />
										<Slider.Thumb index={0} class="volume-thumb" />
									</Slider.Root>
									<span class="volume-label">{volumePercent}%</span>
								</div>
							</div>

							<div class="field-group">
								<div class="audio-toggle-row">
									<label class="field-label">음소거</label>
									<Switch.Root
										checked={settingsState.muted}
										onCheckedChange={(checked) => (settingsState.muted = checked)}
										class="mute-switch"
									>
										<Switch.Thumb class="mute-thumb" />
									</Switch.Root>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<Dialog.Close class="settings-close">✕</Dialog.Close>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.settings-overlay) {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.6);
	}

	:global(.settings-content) {
		position: fixed;
		left: 50%;
		top: 50%;
		z-index: 201;
		transform: translate(-50%, -50%);
		background: rgba(16, 24, 48, 0.97);
		border: 1px solid #0f3460;
		border-radius: 12px;
		width: 560px;
		max-width: calc(100vw - 32px);
		max-height: calc(100vh - 64px);
		overflow: hidden;
		font-family: 'MulmaruMono', monospace;
		color: #e0e0ff;
	}

	:global(.settings-close) {
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

	:global(.settings-close:hover) {
		color: #e0e0ff;
		background: var(--color-primary-alpha-50);
	}

	.settings-layout {
		display: flex;
		min-height: 400px;
		max-height: calc(100vh - 96px);
	}

	.settings-sidebar {
		display: flex;
		flex-direction: column;
		width: 140px;
		flex-shrink: 0;
		padding: 16px 8px;
		border-right: 1px solid #0f3460;
		gap: 4px;
	}

	:global(.settings-title) {
		font-size: 16px;
		font-weight: 600;
		color: #e0e0ff;
		padding: 8px 12px;
		margin: 0 0 8px 0;
	}

	.sidebar-item {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: 8px;
		font-size: 13px;
		color: #aaaacc;
		font-family: 'MulmaruMono', monospace;
		transition:
			background 0.15s,
			color 0.15s;
		user-select: none;
	}

	.sidebar-item:hover {
		color: #e0e0ff;
		background: var(--color-primary-alpha-30);
	}

	.sidebar-item.active {
		color: #e0e0ff;
		background: var(--color-primary);
	}

	.settings-body {
		flex: 1;
		padding: 20px 24px;
		overflow-y: auto;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.section-heading {
		font-size: 15px;
		font-weight: 600;
		margin: 0;
		color: #e0e0ff;
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

	.nickname-row {
		display: flex;
		gap: 8px;
	}

	.nickname-input {
		flex: 1;
		padding: 8px 12px;
		background: #16213e;
		border: 2px solid #0f3460;
		border-radius: 8px;
		color: #e0e0ff;
		font-size: 14px;
		font-family: 'MulmaruMono', monospace;
		outline: none;
		transition: border-color 0.2s;
	}

	.nickname-input:focus {
		border-color: var(--color-primary);
	}

	.nickname-input::placeholder {
		color: #555580;
	}

	.field-error {
		margin: 0;
		font-size: 12px;
		color: #ef4444;
	}

	.apply-btn {
		all: unset;
		cursor: pointer;
		align-self: flex-start;
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

	.apply-btn:hover {
		background: var(--color-primary-hover);
	}

	.audio-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.volume-label {
		font-size: 13px;
		color: #aaaacc;
		min-width: 36px;
		text-align: right;
	}

	.audio-toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	/* Mobile: sidebar becomes top tabs */
	@media (max-width: 767px) {
		:global(.settings-content) {
			width: calc(100vw - 16px);
			max-height: calc(100vh - 32px);
			top: 50%;
		}

		.settings-layout {
			flex-direction: column;
			min-height: auto;
		}

		.settings-sidebar {
			width: auto;
			flex-direction: row;
			border-right: none;
			border-bottom: 1px solid #0f3460;
			padding: 12px 8px 8px;
			gap: 4px;
			overflow-x: auto;
		}

		:global(.settings-title) {
			display: none;
		}

		.sidebar-item {
			flex-shrink: 0;
			padding: 6px 14px;
			font-size: 12px;
		}

		.settings-body {
			padding: 16px;
			max-height: calc(100vh - 160px);
			overflow-y: auto;
		}
	}
</style>

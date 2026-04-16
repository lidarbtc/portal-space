<script lang="ts">
	import { network } from '$lib/network'
	import { DEFAULT_COLORS } from '$lib/game/palette-swap'
	import type { OutgoingMessage, ColorPalette } from '@shared/types'
	import { PersistedState } from 'runed'
	import ColorCustomizer from './color-customizer.svelte'

	let {
		onJoin,
	}: {
		onJoin: (data: {
			nickname: string
			colors: ColorPalette
			snapshot: OutgoingMessage
		}) => void
	} = $props()

	const persistedNickname = new PersistedState('portal-nickname', '')
	const persistedBodyColor = new PersistedState('portal-color-body', DEFAULT_COLORS.body)
	const persistedEyeColor = new PersistedState('portal-color-eye', DEFAULT_COLORS.eye)
	const persistedFootColor = new PersistedState('portal-color-foot', DEFAULT_COLORS.foot)

	let error = $state('')
	let joining = $state(false)

	const NICKNAME_NOUNS = ['고랭', '고퍼', '고슬람', '러슬람', '페리스', '포탈', '터널', '릴레이']

	function generateRandomNickname(): string {
		const noun = NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)]
		const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
		return noun + digits
	}

	function getCurrentColors(): ColorPalette {
		return {
			body: persistedBodyColor.current,
			eye: persistedEyeColor.current,
			foot: persistedFootColor.current,
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.isComposing && !joining) {
			handleJoin()
		}
	}

	async function handleJoin() {
		error = ''
		persistedNickname.current = persistedNickname.current.trim()

		if (!persistedNickname.current) {
			error = '닉네임을 입력해주세요.'
			return
		}

		if (persistedNickname.current.length > 20) {
			error = '닉네임은 20자 이하로 입력해주세요.'
			return
		}

		joining = true
		const colors = getCurrentColors()

		try {
			const snapshot = await network.connect(persistedNickname.current, colors)
			onJoin({ nickname: persistedNickname.current, colors, snapshot })
		} catch (err) {
			error = err instanceof Error ? err.message : '연결에 실패했습니다.'
			joining = false
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div id="lobby-overlay">
	<div id="nickname-form">
		<h1>Portal Space</h1>
		<p>2D 가상 코워킹 스페이스</p>

		<ColorCustomizer
			bind:bodyColor={persistedBodyColor.current}
			bind:eyeColor={persistedEyeColor.current}
			bind:footColor={persistedFootColor.current}
		/>

		<div class="input-row">
			<div class="nickname-input-wrapper">
				<input
					id="nickname-input"
					type="text"
					placeholder="닉네임 입력"
					maxlength={20}
					bind:value={persistedNickname.current}
				/>
				<button
					class="nickname-dice-btn"
					onclick={() => (persistedNickname.current = generateRandomNickname())}
					aria-label="랜덤 닉네임 생성"
					type="button"
				>
					🎲
				</button>
			</div>

			<button id="join-btn" onclick={handleJoin} disabled={joining}>
				{joining ? '접속 중...' : '입장'}
			</button>
		</div>

		{#if error}
			<div id="error-msg">{error}</div>
		{/if}
	</div>
</div>

<style>
	:global(.customization-area) {
		margin-bottom: 1.5rem;
	}
</style>

<script lang="ts">
	import { createPreviewCanvas } from '$lib/game/palette-swap'
	import type { ColorPalette } from '@shared/types'

	let {
		bodyColor = $bindable(),
		eyeColor = $bindable(),
		footColor = $bindable(),
	}: {
		bodyColor: string
		eyeColor: string
		footColor: string
	} = $props()

	const PRESETS: { name: string; body: string; eye: string; foot: string }[] = [
		{ name: '기본', body: '#80d3e1', eye: '#ffffff', foot: '#eacb9e' },
		{ name: '노을', body: '#d94a4a', eye: '#ffffff', foot: '#8a2c2c' },
		{ name: '숲', body: '#5cb85c', eye: '#ffffff', foot: '#3a7a3a' },
		{ name: '바다', body: '#4a90d9', eye: '#ffffff', foot: '#2c5a8a' },
		{ name: '보라', body: '#9b59b6', eye: '#ffffff', foot: '#6c3483' },
		{ name: '골드', body: '#f39c12', eye: '#ffffff', foot: '#d35400' },
	]

	let previewCanvas: HTMLCanvasElement | undefined = $state()
	let gopherImage: HTMLImageElement | null = $state(null)

	function getCurrentColors(): ColorPalette {
		return { body: bodyColor, eye: eyeColor, foot: footColor }
	}

	function applyPreset(preset: (typeof PRESETS)[number]) {
		bodyColor = preset.body
		eyeColor = preset.eye
		footColor = preset.foot
	}

	function resetColors() {
		applyPreset(PRESETS[0])
	}

	$effect(() => {
		const img = new Image()
		img.src = '/assets/gopher.png'
		img.onload = () => {
			gopherImage = img
		}
		img.onerror = () => {
			gopherImage = null
		}
	})

	$effect(() => {
		if (previewCanvas && gopherImage) {
			const colors = getCurrentColors()
			createPreviewCanvas(previewCanvas, colors, gopherImage)
		}
	})
</script>

<div class="customization-area">
	<div class="preview-section">
		<canvas bind:this={previewCanvas} width="96" height="96" class="gopher-preview"></canvas>
	</div>

	<div class="color-controls">
		<div class="preset-row">
			{#each PRESETS as preset (preset.name)}
				<button
					class="preset-btn"
					onclick={() => applyPreset(preset)}
					aria-label="{preset.name} 프리셋"
					title={preset.name}
				>
					<span class="preset-swatch" style="background: {preset.body};"></span>
				</button>
			{/each}
		</div>

		<div class="color-pickers">
			<label class="color-picker-label">
				<span class="color-label-text">몸통</span>
				<input type="color" bind:value={bodyColor} />
			</label>
			<label class="color-picker-label">
				<span class="color-label-text">눈</span>
				<input type="color" bind:value={eyeColor} />
			</label>
			<label class="color-picker-label">
				<span class="color-label-text">배/발</span>
				<input type="color" bind:value={footColor} />
			</label>
			<button
				class="reset-btn"
				onclick={resetColors}
				type="button"
				title="기본 색상으로 복원"
			>
				초기화
			</button>
		</div>
	</div>
</div>

<style>
	.customization-area {
		display: flex;
		gap: 16px;
		align-items: center;
	}

	.preview-section {
		flex-shrink: 0;
	}

	.gopher-preview {
		width: 96px;
		height: 96px;
		image-rendering: pixelated;
		border: 3px solid #0f3460;
		border-radius: 8px;
		background: #16213e;
	}

	.color-controls {
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex: 1;
	}

	.preset-row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.preset-btn {
		width: 32px;
		height: 32px;
		border: 2px solid #0f3460;
		border-radius: 6px;
		cursor: pointer;
		background: #16213e;
		padding: 3px;
		transition: border-color 0.2s;
	}

	.preset-btn:hover {
		border-color: var(--color-primary-hover);
	}

	.preset-swatch {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 3px;
	}

	.color-pickers {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	.color-picker-label {
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}

	.color-label-text {
		font-size: 12px;
		color: #aaaacc;
	}

	.color-picker-label input[type='color'] {
		width: 28px;
		height: 28px;
		border: 2px solid #0f3460;
		border-radius: 4px;
		cursor: pointer;
		background: none;
		padding: 0;
	}

	.color-picker-label input[type='color']::-webkit-color-swatch-wrapper {
		padding: 2px;
	}

	.color-picker-label input[type='color']::-webkit-color-swatch {
		border: none;
		border-radius: 2px;
	}

	.reset-btn {
		font-size: 11px;
		padding: 4px 8px;
		border: 1px solid #0f3460;
		border-radius: 4px;
		background: #16213e;
		color: #aaaacc;
		cursor: pointer;
		transition:
			border-color 0.2s,
			color 0.2s;
	}

	.reset-btn:hover {
		border-color: var(--color-primary-hover);
		color: #e0e0ff;
	}

	@media (max-width: 480px) {
		.customization-area {
			flex-direction: column;
		}
	}
</style>

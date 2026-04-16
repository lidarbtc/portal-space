<script lang="ts">
	import ZoomControls from './zoom-controls.svelte'
	import { IsMobile } from '$lib/hooks/is-mobile.svelte'

	const isMobile = new IsMobile()
</script>

<nav class="gnb">
	<img src="/favicon.svg" alt="Portal Space" width="24" height="24" />
	<span class="title">Portal Space</span>
	<div class="spacer"></div>
	{#if !isMobile.current}
		<ZoomControls />
	{/if}
	<a
		href="https://github.com/1ncursio/portal-space"
		target="_blank"
		rel="noopener noreferrer"
		class="github-link"
		aria-label="GitHub repository"
	>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path
				d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
			/>
		</svg>
	</a>
</nav>

<style>
	.spacer {
		flex: 1;
	}

	.gnb {
		height: var(--gnb-height, 48px);
		background: #1a1a2e;
		border-bottom: 1px solid #0f3460;
		position: relative;
		z-index: 200;
		display: flex;
		align-items: center;
		padding: 0 16px;
		gap: 10px;
	}

	.title {
		color: var(--color-primary, #06b6d4);
		font-size: 1.1rem;
		font-weight: bold;
		font-family: 'MulmaruMono', monospace;
	}

	.github-link {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #aaaacc;
		transition: color 0.2s;
	}

	.github-link:hover {
		color: #e0e0ff;
	}

	@media (max-width: 767px) {
		.title {
			display: none;
		}
	}
</style>

<script lang="ts">
	const BASE_URL = 'https://space.portal.1ncursio.dev';

	interface Props {
		title?: string;
		description?: string;
		image?: string;
		url?: string;
	}

	let {
		title = 'Portal Space',
		description = '함께 모여 소통하는 가상 공간',
		image = '/assets/og-image.jpg',
		url = '/',
	}: Props = $props();
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="author" content="Portal Space" />
	<meta name="theme-color" content="#6366f1" />
	<meta http-equiv="content-language" content="ko" />

	<!-- Open Graph -->
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${BASE_URL}${url}`} />
	<meta property="og:image" content={`${BASE_URL}${image}`} />
	<meta property="og:locale" content="ko_KR" />
	<meta property="og:site_name" content="Portal Space" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={`${BASE_URL}${image}`} />
</svelte:head>

<script lang="ts">
	import '../lib/styles/app.css';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { Toaster } from 'svelte-sonner';
	import favicon from '#lib/assets/favicon.svg';
	import { queryClient } from '#lib/query';
	import '#lib/theme';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#18181b" />
	<title>SlatePOS — Restaurant operations</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
<Toaster position="bottom-right" closeButton />

<style>
	:global([data-sonner-toast]) {
		background: var(--surface);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		box-shadow: var(--shadow-2);
		font-family: var(--font-sans);
		font-size: 13px;
	}
	:global([data-sonner-toast] [data-title]) {
		font-weight: 600;
	}
	:global([data-sonner-toast] [data-description]) {
		color: var(--ink-2);
	}
	:global([data-sonner-toast] [data-button]) {
		background: var(--brass);
		color: #fffaf2;
		border-radius: var(--r-sm);
	}
</style>

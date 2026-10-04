<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils';

	let {
		title,
		sub,
		actions,
		class: className
	}: {
		title: string;
		sub?: string;
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<header class={cn('plate-head', className)}>
	<div class="min-w-0">
		<h2 class="plate-title truncate">{title}</h2>
		{#if sub}<p class="text-ink-3 mt-1 text-xs">{sub}</p>{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
	{/if}
</header>

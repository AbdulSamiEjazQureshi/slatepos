<script lang="ts">
	import type { Snippet } from 'svelte';

	/** The heading owns its weight; no eyebrow rides above it. */
	let { title, sub, actions }: { title: string; sub?: string; actions?: Snippet } = $props();
</script>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div class="min-w-0">
		<h1 class="text-ink text-[28px] font-[650] tracking-[-0.02em]">{title}</h1>
		{#if sub}<p class="text-ink-2 mt-1 text-[13px]">{sub}</p>{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</div>

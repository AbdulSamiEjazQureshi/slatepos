<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils';
	let {
		label,
		value,
		unit,
		sub,
		delta,
		deltaTone = 'neutral',
		wide = false,
		class: className,
		footer
	}: {
		label: string;
		value: string;
		unit?: string;
		sub?: string;
		delta?: string;
		deltaTone?: 'herb' | 'brick' | 'neutral';
		wide?: boolean;
		class?: string;
		footer?: Snippet;
	} = $props();
	const TONE = { herb: 'text-herb', brick: 'text-brick', neutral: 'text-ink-3' } as const;
</script>

<div class={cn('plate metric-card', wide && 'sm:col-span-2 lg:col-span-2', className)}>
	<div class="flex items-center justify-between gap-3">
		<p class="text-ink-2 text-sm font-medium">{label}</p>
		{#if delta}<span class={cn('text-xs font-medium', TONE[deltaTone])}>{delta}</span>{/if}
	</div>
	<p class="metric-value">
		{value}{#if unit}<span class="text-ink-3 text-sm font-normal"> {unit}</span>{/if}
	</p>
	{#if sub}<p class="text-ink-3 text-xs leading-relaxed">{sub}</p>{/if}
	{#if footer}<div class="border-line mt-4 border-t pt-3">{@render footer()}</div>{/if}
</div>

<style>
	.metric-card {
		padding: 20px;
	}
	.metric-value {
		margin: 14px 0 10px;
		font-size: clamp(24px, 2.4vw, 32px);
		line-height: 1.1;
		font-weight: 600;
		letter-spacing: -0.03em;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
</style>

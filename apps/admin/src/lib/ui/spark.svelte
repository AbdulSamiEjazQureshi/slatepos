<script lang="ts">
	import { cn } from '#lib/utils';

	/** A measured bar sparkline. Bars carry a title so the value is never
	 *  colour-only; the peak is marked with a hairline. */
	let {
		data,
		labels,
		height = 40,
		class: className
	}: {
		data: number[];
		labels?: string[];
		height?: number;
		class?: string;
	} = $props();

	const max = $derived(Math.max(...data, 1));
	const peak = $derived(data.indexOf(Math.max(...data)));
</script>

<div class={cn('spark', className)} style="height: {height}px" role="img" aria-label="Trend">
	{#each data as value, i (i)}
		<div
			class="spark-bar {i === peak ? 'is-peak' : ''}"
			style="height: {Math.max(4, (value / max) * 100)}%"
			title={`${labels?.[i] ?? ''} ${value.toLocaleString()}`.trim()}
		></div>
	{/each}
</div>

<style>
	.spark-bar.is-peak {
		background: var(--brass);
	}
</style>

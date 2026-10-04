<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { cn } from '#lib/utils';

	/** An empty state that teaches the interface instead of announcing absence. */
	let {
		icon: Icon,
		title,
		body,
		action,
		class: className
	}: {
		icon?: Component;
		title: string;
		body?: string;
		action?: Snippet;
		class?: string;
	} = $props();
</script>

<div class={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
	{#if Icon}
		<div
			class="border-line bg-surface-2 text-ink-3 mb-4 grid size-11 place-items-center rounded-md border"
		>
			<Icon size={20} strokeWidth={1.6} />
		</div>
	{/if}
	<p class="text-ink text-[15px] font-semibold">{title}</p>
	{#if body}<p class="text-ink-2 mt-1.5 max-w-[42ch] text-[13px]">{body}</p>{/if}
	{#if action}<div class="mt-5">{@render action()}</div>{/if}
</div>

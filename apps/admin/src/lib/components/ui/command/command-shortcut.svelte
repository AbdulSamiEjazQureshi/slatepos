<script lang="ts">
	import { untrack } from 'svelte';
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();
</script>

<span
	{@attach (node) => {
		untrack(() => {
			if (ref !== node) ref = node;
		});
		return () => {
			untrack(() => {
				if (ref === node) ref = null;
			});
		};
	}}
	data-slot="command-shortcut"
	class={cn(
		'text-muted-foreground group-data-selected/command-item:text-foreground ml-auto text-xs tracking-widest',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</span>

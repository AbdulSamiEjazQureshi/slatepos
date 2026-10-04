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
	data-slot="dropdown-menu-shortcut"
	class={cn(
		'text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground ml-auto text-xs tracking-widest',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</span>

<script lang="ts">
	import { untrack } from 'svelte';
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		inset?: boolean;
	} = $props();
</script>

<div
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
	data-slot="dropdown-menu-label"
	data-inset={inset}
	class={cn('text-muted-foreground px-1.5 py-1 text-xs font-medium data-inset:pl-7', className)}
	{...restProps}
>
	{@render children?.()}
</div>

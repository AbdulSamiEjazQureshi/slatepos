<script lang="ts">
	import { untrack } from 'svelte';
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
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
	data-slot="popover-header"
	class={cn('flex flex-col gap-0.5 text-sm', className)}
	{...restProps}
>
	{@render children?.()}
</div>

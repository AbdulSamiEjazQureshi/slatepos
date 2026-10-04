<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils';

	/** A surface plate. `flush` drops the shadow for plates that sit inside a
	 *  larger plane; `inset` uses the recessed ground tone. */
	let {
		flush = false,
		inset = false,
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLDivElement> & {
		flush?: boolean;
		inset?: boolean;
		class?: string;
	} = $props();
</script>

<div class={cn('plate', flush && 'plate-flush', inset && 'bg-surface-2', className)} {...rest}>
	{@render children?.()}
</div>

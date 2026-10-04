<script lang="ts" module>
	export type StampTone = 'neutral' | 'herb' | 'amber' | 'brick' | 'slate' | 'brass';
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { cn } from '#lib/utils';
	let {
		tone = 'neutral',
		dot = true,
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLSpanElement> & { tone?: StampTone; dot?: boolean } = $props();
	const tones = {
		neutral: 'border-border bg-muted/50 text-muted-foreground',
		herb: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400',
		amber:
			'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
		brick:
			'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
		slate:
			'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400',
		brass:
			'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-400'
	};
</script>

<Badge
	variant="outline"
	class={cn('h-6 gap-1.5 rounded-md px-2 text-[11px] font-medium', tones[tone], className)}
	{...rest}
>
	{#if dot}<span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>{/if}
	{@render children?.()}
</Badge>

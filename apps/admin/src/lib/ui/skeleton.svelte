<script lang="ts">
	import { cn } from '#lib/utils';

	let { rows = 5, class: className }: { rows?: number; class?: string } = $props();
</script>

<div class={cn('space-y-2 p-4', className)} aria-hidden="true">
	{#each { length: rows } as _, i (i)}
		<div class="skel h-9" style="opacity: {1 - i * 0.13}"></div>
	{/each}
</div>

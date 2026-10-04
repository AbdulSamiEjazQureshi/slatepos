<script lang="ts">
	import { connection } from '#lib/realtime';
	import { cn } from '#lib/utils';

	/** The connection is stated in words as well as a mark — a cashier must be
	 *  able to trust that what they see is current. */
	const VIEW = {
		idle: { label: 'Not connected', tone: 'text-ink-3', dot: 'bg-ink-3' },
		connecting: { label: 'Connecting', tone: 'text-amber', dot: 'bg-amber' },
		live: { label: 'Live', tone: 'text-herb', dot: 'bg-herb' },
		reconnecting: { label: 'Reconnecting', tone: 'text-amber', dot: 'bg-amber' },
		offline: { label: 'Offline', tone: 'text-brick', dot: 'bg-brick' }
	} as const;

	let view = $derived(VIEW[$connection]);
</script>

<span
	class={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', view.tone)}
	title="Realtime connection to the kitchen and the floor"
>
	<span class="relative flex size-1.5">
		{#if $connection === 'live'}
			<span class="bg-herb absolute inline-flex size-full animate-ping rounded-full opacity-60"
			></span>
		{/if}
		<span class={cn('relative inline-flex size-1.5 rounded-full', view.dot)}></span>
	</span>
	{view.label}
</span>

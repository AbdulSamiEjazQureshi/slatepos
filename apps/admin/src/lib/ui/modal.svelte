<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	let {
		open = $bindable(false),
		title,
		sub,
		width = 520,
		children,
		footer,
		onOpenChange,
		presentation = 'dialog'
	}: {
		open?: boolean;
		title: string;
		sub?: string;
		width?: number;
		children: Snippet;
		footer?: Snippet;
		onOpenChange?: (open: boolean) => void;
		presentation?: 'dialog' | 'sheet';
	} = $props();
</script>

{#if presentation === 'sheet'}
	<Sheet.Root bind:open {onOpenChange}>
		<Sheet.Content
			class="w-full gap-0 sm:max-w-xl"
			style={`width: min(${width}px, 100vw); max-width: none;`}
		>
			<Sheet.Header class="border-border border-b p-6 pr-12"
				><Sheet.Title>{title}</Sheet.Title><Sheet.Description class={sub ? '' : 'sr-only'}
					>{sub ?? title}</Sheet.Description
				></Sheet.Header
			>
			<div class="min-h-0 flex-1 overflow-y-auto p-6">{@render children()}</div>
			{#if footer}<Sheet.Footer class="border-border bg-muted/30 flex-row justify-end border-t p-4"
					>{@render footer()}</Sheet.Footer
				>{/if}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Dialog.Root bind:open {onOpenChange}>
		<Dialog.Content
			class="gap-0 overflow-hidden p-0"
			style={`width: min(${width}px, calc(100vw - 32px)); max-width: none;`}
		>
			<Dialog.Header class="border-border border-b p-6 pr-12"
				><Dialog.Title>{title}</Dialog.Title><Dialog.Description class={sub ? '' : 'sr-only'}
					>{sub ?? title}</Dialog.Description
				></Dialog.Header
			>
			<div class="max-h-[65dvh] overflow-y-auto p-6">{@render children()}</div>
			{#if footer}<Dialog.Footer class="border-border bg-muted/30 border-t p-4"
					>{@render footer()}</Dialog.Footer
				>{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}

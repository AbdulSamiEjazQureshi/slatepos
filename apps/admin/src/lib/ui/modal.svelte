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
	const validateAction = (footerNode: HTMLElement) => {
		const validate = (event: MouseEvent) => {
			const target =
				event.target instanceof Element
					? event.target.closest('button[data-form-action="primary"]')
					: null;
			if (!target) return;
			const surface = footerNode.closest('[role="dialog"]');
			const controls = surface?.querySelectorAll<
				HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
			>(
				'input:not([type=hidden]), textarea, select, button[data-slot="select-trigger"][aria-required="true"]'
			);
			let invalid: HTMLElement | undefined;
			for (const control of controls ?? []) {
				if (control.disabled) continue;
				if (control instanceof HTMLButtonElement) {
					control.dispatchEvent(new Event('field-validate'));
					if (!control.dataset.fieldValue) invalid ??= control;
				} else if (!control.checkValidity()) invalid ??= control;
			}
			if (invalid) {
				event.preventDefault();
				event.stopPropagation();
				invalid.focus();
				invalid.scrollIntoView({ block: 'nearest' });
			}
		};
		footerNode.addEventListener('click', validate, true);
		return () => footerNode.removeEventListener('click', validate, true);
	};
</script>

{#if presentation === 'sheet'}
	<Sheet.Root bind:open {onOpenChange}>
		<Sheet.Content
			class="form-surface w-full gap-0 sm:max-w-xl"
			style={`width: min(${width}px, 100vw); max-width: none;`}
		>
			<Sheet.Header class="form-surface-header border-border border-b p-6 pr-12"
				><Sheet.Title>{title}</Sheet.Title><Sheet.Description class={sub ? '' : 'sr-only'}
					>{sub ?? title}</Sheet.Description
				></Sheet.Header
			>
			<div class="form-surface-body min-h-0 flex-1 overflow-y-auto p-6">{@render children()}</div>
			{#if footer}<Sheet.Footer
					{@attach validateAction}
					class="form-surface-footer border-border flex-row justify-end border-t p-5"
					>{@render footer()}</Sheet.Footer
				>{/if}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Dialog.Root bind:open {onOpenChange}>
		<Dialog.Content
			class="form-surface gap-0 overflow-hidden p-0"
			style={`width: min(${width}px, calc(100vw - 32px)); max-width: none;`}
		>
			<Dialog.Header class="form-surface-header border-border border-b p-6 pr-12"
				><Dialog.Title>{title}</Dialog.Title><Dialog.Description class={sub ? '' : 'sr-only'}
					>{sub ?? title}</Dialog.Description
				></Dialog.Header
			>
			<div class="form-surface-body max-h-[65dvh] overflow-y-auto p-6">{@render children()}</div>
			{#if footer}<Dialog.Footer
					{@attach validateAction}
					class="form-surface-footer border-border border-t p-5">{@render footer()}</Dialog.Footer
				>{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}

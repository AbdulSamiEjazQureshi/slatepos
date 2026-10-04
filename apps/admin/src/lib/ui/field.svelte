<script lang="ts">
	import { Label } from '#lib/components/ui/label/index.js';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils';

	let {
		label,
		hint,
		error,
		required = false,
		for: htmlFor,
		class: className,
		children
	}: {
		label?: string;
		hint?: string;
		error?: string | null;
		required?: boolean;
		for?: string;
		class?: string;
		children: Snippet;
	} = $props();
	const fieldId = $props.id();
	const associateField = (node: HTMLDivElement) => {
		if (!label) return;
		const control = node.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
			'input:not([type=hidden]), select, textarea, button[data-slot=select-trigger]'
		);
		const caption = node.querySelector('label');
		if (!control || !caption) return;
		control.id ||= fieldId;
		caption.htmlFor = htmlFor ?? control.id;
		if (required && ['INPUT', 'TEXTAREA'].includes(control.tagName))
			control.setAttribute('required', '');
		control.setAttribute('aria-invalid', String(Boolean(error)));
		if (hint || error) control.setAttribute('aria-describedby', `${fieldId}-help`);
	};
</script>

<div {@attach associateField} class={cn('min-w-0', className)}>
	{#if label}
		<Label class="mb-2 text-[13px] font-medium" for={htmlFor}>
			{label}{#if required}<span class="text-brick" aria-hidden="true"> *</span>{/if}
		</Label>
	{/if}
	{@render children()}
	{#if error}
		<p id={`${fieldId}-help`} role="alert" class="text-brick mt-1.5 text-[12px]">{error}</p>
	{:else if hint}
		<p id={`${fieldId}-help`} class="text-ink-3 mt-1.5 text-[12px]">{hint}</p>
	{/if}
</div>

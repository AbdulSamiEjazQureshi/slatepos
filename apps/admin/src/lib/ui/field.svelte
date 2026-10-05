<script lang="ts">
	import { Label } from '#lib/components/ui/label/index.js';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils';
	let {
		label,
		hint,
		error,
		required = false,
		optional = false,
		for: htmlFor,
		class: className,
		children
	}: {
		label?: string;
		hint?: string;
		error?: string | null;
		required?: boolean;
		optional?: boolean;
		for?: string;
		class?: string;
		children: Snippet;
	} = $props();
	const fieldId = $props.id();
	let localError = $state<string | null>(null);
	const displayedError = $derived(error || localError);
	const associateField = (node: HTMLDivElement) => {
		const control = node.querySelector<
			HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
		>('input:not([type=hidden]), select, textarea, button[data-slot=select-trigger]');
		const caption = node.querySelector('label');
		if (!control) {
			if (label) {
				node.setAttribute('role', 'group');
				node.setAttribute('aria-labelledby', `${fieldId}-label`);
			}
			return;
		}
		control.id ||= htmlFor ?? fieldId;
		if (caption) caption.htmlFor = control.id;
		if (required) {
			control.setAttribute('aria-required', 'true');
			if (
				control instanceof HTMLInputElement ||
				control instanceof HTMLTextAreaElement ||
				control instanceof HTMLSelectElement
			)
				control.required = true;
		}
		control.setAttribute('aria-invalid', String(Boolean(displayedError)));
		const describedBy = (control.getAttribute('aria-describedby') ?? '')
			.split(' ')
			.filter((id) => id && id !== `${fieldId}-hint` && id !== `${fieldId}-error`);
		if (hint) describedBy.push(`${fieldId}-hint`);
		if (displayedError) describedBy.push(`${fieldId}-error`);
		if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
		else control.removeAttribute('aria-describedby');
		const validate = () => {
			if (control.disabled) return;
			if (control instanceof HTMLButtonElement) {
				localError =
					required && !control.dataset.fieldValue
						? `Choose ${label?.toLowerCase() ?? 'an option'}.`
						: null;
				return;
			}
			localError = control.validity.valid
				? null
				: control.validity.valueMissing
					? `Enter ${label?.toLowerCase() ?? 'a value'}.`
					: control.validationMessage;
		};
		const clear = () => {
			if (localError) validate();
		};
		const selectionObserver =
			control instanceof HTMLButtonElement
				? new MutationObserver(() => {
						if (localError) validate();
					})
				: null;
		selectionObserver?.observe(control, {
			attributes: true,
			attributeFilter: ['data-field-value']
		});
		control.addEventListener('blur', validate);
		control.addEventListener('invalid', validate);
		control.addEventListener('field-validate', validate);
		control.addEventListener('input', clear);
		return () => {
			selectionObserver?.disconnect();
			control.removeEventListener('blur', validate);
			control.removeEventListener('invalid', validate);
			control.removeEventListener('field-validate', validate);
			control.removeEventListener('input', clear);
		};
	};
</script>

<div
	{@attach associateField}
	class={cn('form-field', className)}
	class:field-error={!!displayedError}
>
	{#if label}
		<div class="form-field-caption">
			<Label id={`${fieldId}-label`} for={htmlFor}>{label}</Label>
			{#if required}<span class="field-requirement">Required</span>{:else if optional}<span
					class="field-requirement">Optional</span
				>{/if}
		</div>
	{/if}
	<div class="form-field-control">{@render children()}</div>
	{#if hint}<p id={`${fieldId}-hint`} class="form-field-hint">{hint}</p>{/if}
	{#if displayedError}<p id={`${fieldId}-error`} role="alert" class="form-field-error">
			{displayedError}
		</p>{/if}
</div>

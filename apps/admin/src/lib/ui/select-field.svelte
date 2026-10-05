<script lang="ts" generics="T extends string | null">
	import * as Select from '#lib/components/ui/select/index.js';
	import type { ComponentProps } from 'svelte';
	let {
		value = $bindable(),
		items,
		placeholder = 'Select…',
		onValueChange,
		class: className,
		...rest
	}: Omit<ComponentProps<typeof Select.Trigger>, 'value' | 'onchange' | 'children'> & {
		value?: T;
		items: { value: string | null; label: string; disabled?: boolean }[];
		placeholder?: string;
		onValueChange?: (value: T) => void;
	} = $props();
	const encodedItems = $derived(
		items.map((item) => ({
			...item,
			value: item.value === null ? '__none__' : item.value === '' ? '__empty__' : item.value
		}))
	);
	const selected = $derived(
		value === null
			? items.some((item) => item.value === null)
				? '__none__'
				: ''
			: value === ''
				? items.some((item) => item.value === '')
					? '__empty__'
					: ''
				: (value ?? '')
	);
</script>

<Select.Root
	type="single"
	items={encodedItems}
	value={selected}
	onValueChange={(next) => {
		value = (next === '__none__' ? null : next === '__empty__' ? '' : next) as T;
		onValueChange?.(value);
	}}
	disabled={!!rest.disabled}
>
	<Select.Trigger data-field-value={value ?? ''} class={`w-full ${className ?? ''}`} {...rest}
		><Select.Value {placeholder} /></Select.Trigger
	>
	<Select.Content
		>{#each encodedItems as item (item.value)}<Select.Item
				value={item.value}
				label={item.label}
				disabled={item.disabled}>{item.label}</Select.Item
			>{/each}</Select.Content
	>
</Select.Root>

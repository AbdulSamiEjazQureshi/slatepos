<script lang="ts" module>
	export type ButtonVariant =
		'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'quiet-danger';
	export type ButtonSize = 'sm' | 'default' | 'lg' | 'icon';
</script>

<script lang="ts">
	import { Button as Primitive } from '#lib/components/ui/button/index.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { cn } from '#lib/utils';
	let {
		variant = 'primary',
		size = 'default',
		loading = false,
		class: className,
		children,
		disabled = false,
		...rest
	}: HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			loading?: boolean;
		} = $props();
	const variants = {
		primary: 'default',
		secondary: 'secondary',
		outline: 'outline',
		ghost: 'ghost',
		danger: 'destructive',
		'quiet-danger': 'destructive'
	} as const;
</script>

<Primitive
	variant={variants[variant]}
	{size}
	disabled={disabled || loading}
	aria-busy={loading || undefined}
	data-form-action={variant === 'primary' ? 'primary' : undefined}
	class={cn(size === 'lg' && 'h-11 px-5', className)}
	{...rest}
>
	{#if loading}<LoaderCircle class="animate-spin" />{/if}
	{@render children?.()}
</Primitive>

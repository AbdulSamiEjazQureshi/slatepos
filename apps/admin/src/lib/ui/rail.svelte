<script lang="ts">
	import { page } from '$app/state';
	import { railCollapsed, toggleRail } from '#lib/shell-store';
	import { visibleGroups } from '#lib/nav-filter';
	import { currentUser } from '#lib/session';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import Search from '@lucide/svelte/icons/search';
	import { openPalette } from './palette-store';
	let { mobileOpen = $bindable(false) }: { mobileOpen?: boolean } = $props();
	const groups = $derived(visibleGroups($currentUser));
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	const group = $derived(
		groups.find((group) => group.items.some((item) => isActive(item.href))) ?? groups[0]
	);
	const descriptions: Record<string, string> = {
		Service: 'Orders, kitchen and the floor',
		Stock: 'Your menu and supply chain',
		'Back office': 'People, finances and insights',
		System: 'Workspace and access'
	};
</script>

{#snippet links(items: (typeof groups)[number]['items'], compact: boolean)}
	{#each items as item (item.href)}
		<a
			href={item.href}
			class="context-link"
			class:context-active={isActive(item.href)}
			aria-current={isActive(item.href) ? 'page' : undefined}
			aria-label={item.label}
			title={compact ? item.label : undefined}
			onclick={() => (mobileOpen = false)}
		>
			<item.icon size={18} strokeWidth={1.8} />
			{#if !compact}<span>{item.label}</span>{/if}
		</a>
	{/each}
{/snippet}

<aside
	class="context-sidebar"
	class:context-collapsed={$railCollapsed}
	aria-label="Workspace navigation"
>
	<div class="context-heading">
		{#if !$railCollapsed}<div>
				<h2>{group?.label ?? 'Workspace'}</h2>
				<p>{descriptions[group?.label ?? '']}</p>
			</div>{/if}
		<button
			type="button"
			onclick={toggleRail}
			aria-label={$railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
			><PanelLeft size={18} /></button
		>
	</div>
	<nav aria-label="Main" class="context-links">
		{@render links(group?.items ?? [], $railCollapsed)}
	</nav>
	<div class="context-help">
		<button type="button" onclick={openPalette} aria-label="Find a page"
			><Search size={16} />{#if !$railCollapsed}<span>Find a page</span><kbd class="kbd">⌘ K</kbd
				>{/if}</button
		>
		{#if !$railCollapsed}<p>Switch sections above to explore your workspace.</p>{/if}
	</div>
</aside>

<Sheet.Root bind:open={mobileOpen}>
	<Sheet.Content
		side="left"
		class="mobile-workspace-nav w-[300px] gap-0 overflow-y-auto p-0"
		showCloseButton={true}
	>
		<Sheet.Header class="px-5 pt-6 pb-5"
			><Sheet.Title>SlatePOS</Sheet.Title><Sheet.Description>Restaurant workspace</Sheet.Description
			></Sheet.Header
		>
		<nav class="px-3 pb-8" aria-label="Main">
			{#each groups as group (group.label)}
				<h2 class="mobile-nav-group">{group.label}</h2>
				{@render links(group.items, false)}
			{/each}
		</nav>
	</Sheet.Content>
</Sheet.Root>

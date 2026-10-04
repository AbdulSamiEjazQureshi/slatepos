<script lang="ts">
	import { page } from '$app/state';
	import { railCollapsed, toggleRail } from '#lib/shell-store';
	import { visibleGroups } from '#lib/nav-filter';
	import { currentUser } from '#lib/session';
	import { cn } from '#lib/utils';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Dropdown from '#lib/components/ui/dropdown-menu/index.js';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Settings from '@lucide/svelte/icons/settings';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { goto } from '$app/navigation';
	let { mobileOpen = $bindable(false) }: { mobileOpen?: boolean } = $props();
	const groups = $derived(visibleGroups($currentUser));
	const collapsed = $derived($railCollapsed);
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

{#snippet navigation(compact: boolean)}
	<div class="flex h-14 shrink-0 items-center justify-between px-4">
		<a href="/dashboard" class="flex items-center gap-2.5" aria-label="SlatePOS"
			><span
				class="bg-foreground text-background grid size-7 place-items-center rounded-md text-sm font-bold"
				>s<span class="sr-only">Slate</span></span
			>{#if !compact}<span class="text-foreground text-[15px] font-semibold tracking-tight"
					>SlatePOS</span
				>{/if}</a
		>
		{#if !compact}<button
				type="button"
				aria-label="Collapse navigation"
				class="text-muted-foreground hover:text-foreground rounded p-1"
				onclick={toggleRail}><PanelLeft size={16} /></button
			>{/if}
	</div>
	{#if !compact}
		<Dropdown.Root>
			<Dropdown.Trigger
				class="border-border bg-background mx-3 my-3 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left shadow-xs"
			>
				<span
					class="bg-muted text-foreground grid size-8 place-items-center rounded-md text-sm font-semibold"
					>{$currentUser?.tenantSlug?.slice(0, 1).toUpperCase() ?? 'R'}</span
				>
				<span class="flex-1 truncate"
					><span class="text-foreground block text-[13px] font-medium capitalize"
						>{$currentUser?.tenantSlug ?? 'Restaurant'}</span
					><span class="text-muted-foreground text-[11px]">Restaurant workspace</span></span
				><ChevronsUpDown size={14} class="text-muted-foreground" />
			</Dropdown.Trigger>
			<Dropdown.Content align="start" class="w-56"
				><Dropdown.Group><Dropdown.Label>Workspace</Dropdown.Label></Dropdown.Group><Dropdown.Item
					onclick={() => {
						mobileOpen = false;
						void goto('/settings');
					}}><Settings />Workspace settings</Dropdown.Item
				><Dropdown.Item
					onclick={() => {
						mobileOpen = false;
						void goto('/admin');
					}}><ArrowUpRight />Administration</Dropdown.Item
				></Dropdown.Content
			>
		</Dropdown.Root>
	{/if}
	<nav class="rail-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-5" aria-label="Main">
		{#each groups as group (group.label)}
			<p class="text-muted-foreground mt-5 mb-2 px-2 text-[11px] font-medium">
				{compact ? '' : group.label}
			</p>
			<div class="space-y-0.5">
				{#each group.items.filter((item) => item.href !== '/settings') as item (item.href)}<a
						href={item.href}
						class={cn(
							'flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors',
							isActive(item.href)
								? 'bg-background text-foreground ring-border font-medium shadow-xs ring-1'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
						aria-current={isActive(item.href) ? 'page' : undefined}
						title={compact ? item.label : undefined}
						onclick={() => (mobileOpen = false)}
						><item.icon size={16} strokeWidth={1.8} />{#if !compact}<span>{item.label}</span
							>{/if}</a
					>{/each}
			</div>
		{/each}
	</nav>
	<div class="border-border border-t p-3">
		{#if compact}<button
				type="button"
				class="text-muted-foreground grid size-9 place-items-center"
				aria-label="Expand navigation"
				onclick={toggleRail}><PanelLeft size={16} /></button
			>{:else}<a
				href="/settings"
				class="text-muted-foreground hover:text-foreground flex h-9 items-center gap-2.5 px-2 text-[13px]"
				><Settings size={16} />Settings</a
			>
			<div class="text-muted-foreground mt-2 flex items-center justify-between px-2 text-[10px]">
				<span>SlatePOS</span><span>Restaurant operations</span>
			</div>{/if}
	</div>
{/snippet}
<aside
	class={cn(
		'rail border-border hidden h-full shrink-0 flex-col border-r bg-[#fafafa] lg:flex dark:bg-[#141416]',
		collapsed ? 'w-16' : 'w-[216px]'
	)}
	aria-label="Workspace navigation"
>
	{@render navigation(collapsed)}
</aside>
<Sheet.Root bind:open={mobileOpen}
	><Sheet.Content side="left" class="w-[280px] gap-0 p-0 sm:max-w-[280px]" showCloseButton={false}
		><Sheet.Header class="sr-only"
			><Sheet.Title>Navigation</Sheet.Title><Sheet.Description
				>Restaurant workspace pages</Sheet.Description
			></Sheet.Header
		>{@render navigation(false)}</Sheet.Content
	></Sheet.Root
>

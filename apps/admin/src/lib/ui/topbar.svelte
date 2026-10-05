<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { api } from '#lib/api';
	import { authenticated, branchId, currentUser, session } from '#lib/session';
	import { branchSwitchLocked } from '#lib/shell-store';
	import { theme, toggleTheme } from '#lib/theme';
	import { openPalette } from '#lib/ui/palette-store';
	import * as Dropdown from '#lib/components/ui/dropdown-menu/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import SelectField from './select-field.svelte';
	import ConnMark from './conn-mark.svelte';
	import Search from '@lucide/svelte/icons/search';
	import Menu from '@lucide/svelte/icons/menu';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Settings from '@lucide/svelte/icons/settings';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	let { onMenu }: { onMenu: () => void } = $props();
	const branches = createQuery(() => ({
		queryKey: ['branches'],
		queryFn: () => api.listBranches(),
		enabled: $authenticated
	}));
	const branchOptions = $derived(
		($currentUser?.branchIds ?? []).map((id) => ({
			value: id,
			label: branches.data?.items.find((row) => row.id === id)?.name ?? 'Loading branch…'
		}))
	);
</script>

<header class="workspace-topbar flex h-16 shrink-0 items-center gap-3 px-4 sm:px-8">
	<Button
		variant="ghost"
		size="icon"
		class="lg:hidden"
		aria-label="Open navigation"
		onclick={onMenu}><Menu /></Button
	>
	<a href="/dashboard" class="workspace-identity" aria-label="SlatePOS home"
		><span class="workspace-monogram">s</span><span>SlatePOS</span></a
	>
	<span class="workspace-tenant hidden md:block">{$currentUser?.tenantSlug ?? 'Restaurant'}</span>
	<div class="flex-1"></div>
	<Button
		variant="ghost"
		aria-label="Search or jump to a page"
		class="workspace-search text-muted-foreground gap-3"
		onclick={openPalette}
		><Search /><span class="hidden sm:inline">Search</span><kbd
			class="hidden rounded border px-1.5 text-[11px] md:inline">⌘ K</kbd
		></Button
	>
	<div class="branch-picker w-36">
		<SelectField
			aria-label="Active branch"
			class="bg-muted/50 border-0"
			value={$branchId}
			items={branchOptions}
			onValueChange={(id) => {
				if (id) session.setBranch(id);
			}}
			disabled={$branchSwitchLocked}
			title={$branchSwitchLocked
				? 'Finish or hold this ticket before changing branch'
				: 'Change branch'}
		/>
	</div>
	<div class="hidden md:block"><ConnMark /></div>
	<Button variant="ghost" size="icon" aria-label="Toggle theme" onclick={toggleTheme}
		>{#if $theme === 'dark'}<Sun />{:else}<Moon />{/if}</Button
	>
	<Dropdown.Root>
		<Dropdown.Trigger
			class="hover:bg-muted flex h-9 items-center gap-2 rounded-md px-1.5"
			aria-label="Account menu"
			><span
				class="bg-foreground text-background grid size-7 place-items-center rounded-full text-xs font-medium"
				>{$currentUser?.fullName?.slice(0, 1).toUpperCase() ?? '?'}</span
			><ChevronDown class="text-muted-foreground size-3" /></Dropdown.Trigger
		>
		<Dropdown.Content align="end" class="w-60">
			<Dropdown.Group
				><Dropdown.Label
					><span class="text-foreground block text-sm">{$currentUser?.fullName}</span><span
						class="mt-1 block font-normal">{$currentUser?.email}</span
					></Dropdown.Label
				></Dropdown.Group
			>
			<Dropdown.Separator />
			<Dropdown.Item onclick={() => goto('/settings')}><Settings />Account settings</Dropdown.Item>
			<Dropdown.Item onclick={toggleTheme}
				>{#if $theme === 'dark'}<Sun />Light appearance{:else}<Moon />Dark appearance{/if}</Dropdown.Item
			>
			<Dropdown.Separator />
			<Dropdown.Item
				variant="destructive"
				onclick={async () => {
					await session.logout();
					await goto('/login');
				}}><LogOut />Sign out</Dropdown.Item
			>
		</Dropdown.Content>
	</Dropdown.Root>
</header>

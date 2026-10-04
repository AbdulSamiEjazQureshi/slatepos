<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import { theme, toggleTheme } from '#lib/theme';
	import { visibleGroups } from '#lib/nav-filter';
	import { currentUser, session } from '#lib/session';
	import { closePalette, paletteOpen } from './palette-store';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import LogOut from '@lucide/svelte/icons/log-out';
	const groups = $derived(visibleGroups($currentUser));
	const navigate = async (href: string) => {
		closePalette();
		await goto(href);
	};
</script>

<Dialog.Root bind:open={$paletteOpen}>
	<Dialog.Content
		class="top-[20%] max-w-xl translate-y-0 overflow-hidden p-0"
		showCloseButton={false}
	>
		<Dialog.Header class="sr-only"
			><Dialog.Title>Command palette</Dialog.Title><Dialog.Description
				>Search pages and workspace actions</Dialog.Description
			></Dialog.Header
		>
		<Command.Root>
			<Command.Input
				placeholder="Search pages and actions…"
				aria-label="Search pages and actions"
			/>
			<Command.List class="max-h-[50vh]">
				<Command.Empty>No matching pages or actions.</Command.Empty>
				{#each groups as group (group.label)}<Command.Group heading={group.label}
						>{#each group.items as item (item.href)}<Command.Item
								value={`${item.label} ${item.hint ?? ''}`}
								onSelect={() => navigate(item.href)}
								><item.icon size={16} /><span>{item.label}</span></Command.Item
							>{/each}</Command.Group
					>{/each}
				<Command.Separator />
				<Command.Group heading="Workspace"
					><Command.Item
						value="Toggle theme"
						onSelect={() => {
							toggleTheme();
							closePalette();
						}}
						>{#if $theme === 'dark'}<Sun />{:else}<Moon />{/if}Toggle theme</Command.Item
					><Command.Item
						value="Sign out"
						onSelect={async () => {
							closePalette();
							await session.logout();
							await goto('/login');
						}}><LogOut />Sign out</Command.Item
					></Command.Group
				>
			</Command.List>
		</Command.Root>
		<div
			class="border-border text-muted-foreground flex justify-between border-t px-4 py-2.5 text-[11px]"
		>
			<span>↑ ↓ to navigate · ↵ to open</span><span>esc to close</span>
		</div>
	</Dialog.Content>
</Dialog.Root>

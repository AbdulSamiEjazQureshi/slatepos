<script lang="ts">
	import { page } from '$app/state';
	import { currentUser } from '#lib/session';
	import { visibleGroups } from '#lib/nav-filter';
	const groups = $derived(visibleGroups($currentUser));
	const activeGroup = $derived(
		groups.find((group) =>
			group.items.some(
				(item) => page.url.pathname === item.href || page.url.pathname.startsWith(`${item.href}/`)
			)
		)
	);
</script>

<nav class="workspace-sections" aria-label="Workspace sections">
	{#each groups as group (group.label)}
		{@const Icon = group.items[0].icon}
		<a
			href={group.items[0].href}
			class:section-active={activeGroup?.label === group.label}
			aria-current={activeGroup?.label === group.label ? 'true' : undefined}
		>
			<Icon size={16} /><span>{group.label}</span>
		</a>
	{/each}
</nav>

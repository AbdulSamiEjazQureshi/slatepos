<script lang="ts">
	import SelectField from '#lib/ui/select-field.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { api, type UserStatus } from '#lib/api';
	import { authenticated, currentUser } from '#lib/session';
	import { formatDateTime, formatNumber, formatRelative, humanizeEnum } from '#lib/format';
	import PageHead from '#lib/ui/page-head.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import Button from '#lib/ui/button.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Modal from '#lib/ui/modal.svelte';
	import Field from '#lib/ui/field.svelte';
	import FormSection from '#lib/ui/form-section.svelte';
	import Figure from '#lib/ui/figure.svelte';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	const queryClient = useQueryClient();

	type Tab = 'users' | 'roles' | 'audit';
	let tab = $state<Tab>('users');
	let query = $state('');

	const users = createQuery(() => ({
		queryKey: ['admin', 'users'],
		queryFn: () => api.listUsers({ pageSize: 100 }),
		enabled: $authenticated
	}));

	const roles = createQuery(() => ({
		queryKey: ['admin', 'roles'],
		queryFn: () => api.listRoles(),
		enabled: $authenticated
	}));

	const branches = createQuery(() => ({
		queryKey: ['admin', 'branches'],
		queryFn: () => api.listBranches(),
		enabled: $authenticated
	}));

	const audit = createQuery(() => ({
		queryKey: ['admin', 'audit'],
		queryFn: () => api.listAuditLogs({ pageSize: 100 }),
		enabled: $authenticated
	}));

	const userRows = $derived(users.data?.items ?? []);
	// The roles route returns a bare array, not a paginated envelope.
	const roleRows = $derived(roles.data ?? []);

	const visibleUsers = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return userRows;
		return userRows.filter((row) =>
			[row.fullName, row.email].some((field) => field?.toLowerCase().includes(needle))
		);
	});

	const admins = $derived(
		userRows.filter((row) => row.isPlatformAdmin || row.roles.includes('TENANT_OWNER')).length
	);

	// ── the open user ─────────────────────────────────────────────────────
	let openFor = $state<string | null>(null);
	const opened = $derived(userRows.find((row) => row.id === openFor) ?? null);

	const userForm = $state({
		fullName: '',
		status: 'ACTIVE' as UserStatus,
		roles: [] as string[],
		branchIds: [] as string[]
	});

	const openUser = (id: string) => {
		const person = userRows.find((row) => row.id === id);
		if (!person) return;
		userForm.fullName = person.fullName;
		userForm.status = person.status;
		userForm.roles = [...person.roles];
		userForm.branchIds = [...person.branchIds];
		openFor = id;
	};

	const saveUser = async () => {
		if (!opened || userForm.roles.length === 0) return;
		try {
			// Roles and branches REPLACE the existing sets rather than merging.
			await api.updateUser(opened.id, {
				fullName: userForm.fullName.trim(),
				status: userForm.status,
				roles: userForm.roles,
				branchIds: userForm.branchIds
			});
			await queryClient.invalidateQueries({ queryKey: ['admin'] });
			toast.success(`${userForm.fullName} updated`);
			openFor = null;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save the user');
		}
	};

	// ── new user ──────────────────────────────────────────────────────────
	let userOpen = $state(false);
	let creatingUser = $state(false);
	let newUser = $state({
		fullName: '',
		email: '',
		password: '',
		roles: ['CASHIER'] as string[],
		branchIds: [] as string[]
	});

	const openCreateUser = () => {
		newUser = { fullName: '', email: '', password: '', roles: ['CASHIER'], branchIds: [] };
		userOpen = true;
	};

	const createUser = async () => {
		creatingUser = true;
		try {
			await api.createUser({
				fullName: newUser.fullName.trim(),
				email: newUser.email.trim().toLowerCase(),
				password: newUser.password,
				roles: newUser.roles,
				branchIds: newUser.branchIds
			});
			await queryClient.invalidateQueries({ queryKey: ['admin'] });
			toast.success(`${newUser.fullName} can sign in now`);
			userOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not create the user');
		} finally {
			creatingUser = false;
		}
	};

	// ── new role ──────────────────────────────────────────────────────────
	let roleOpen = $state(false);
	let creatingRole = $state(false);
	let newRole = $state({ name: '', description: '', permissions: [] as string[] });

	const openCreateRole = () => {
		newRole = { name: '', description: '', permissions: [] };
		roleOpen = true;
	};

	const createRole = async () => {
		creatingRole = true;
		try {
			await api.createRole({
				name: newRole.name.trim().toUpperCase().replace(/\s+/g, '_'),
				...(newRole.description ? { description: newRole.description } : {}),
				permissions: newRole.permissions
			});
			await queryClient.invalidateQueries({ queryKey: ['admin'] });
			toast.success(`${newRole.name} created`);
			roleOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not create the role');
		} finally {
			creatingRole = false;
		}
	};

	/** Every permission string the API knows about, grouped by the noun it acts on. */
	const PERMISSIONS = [
		'orders.read',
		'orders.create',
		'orders.update',
		'orders.cancel',
		'orders.refund',
		'payments.read',
		'payments.manage',
		'payments.refund',
		'products.read',
		'products.create',
		'products.update',
		'products.delete',
		'categories.read',
		'categories.manage',
		'inventory.read',
		'inventory.adjust',
		'inventory.transfer',
		'purchases.read',
		'purchases.manage',
		'customers.read',
		'customers.manage',
		'tables.read',
		'tables.manage',
		'kitchen.read',
		'kitchen.manage',
		'staff.read',
		'staff.manage',
		'reports.read',
		'accounting.read',
		'accounting.manage',
		'settings.read',
		'settings.manage',
		'audit.read',
		'tenants.manage'
	];

	const permissionGroups = $derived.by(() => {
		const map = new SvelteMap<string, string[]>();
		for (const permission of PERMISSIONS) {
			const [noun] = permission.split('.');
			map.set(noun, [...(map.get(noun) ?? []), permission]);
		}
		return [...map.entries()];
	});

	const toggle = (list: string[], value: string): string[] =>
		list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

	const STATUS_TONE: Record<string, 'herb' | 'amber' | 'brick' | 'neutral' | 'slate'> = {
		ACTIVE: 'herb',
		INVITED: 'slate',
		SUSPENDED: 'amber',
		DISABLED: 'brick'
	};
</script>

<svelte:head><title>Administration — ROMS</title></svelte:head>

<PageHead title="Administration" sub="Who can sign in, what they may do, and what they did">
	{#snippet actions()}
		{#if tab === 'roles'}
			<Button size="sm" onclick={openCreateRole}>
				<Plus size={14} />
				New role
			</Button>
		{:else}
			<Button size="sm" onclick={openCreateUser}>
				<Plus size={14} />
				New user
			</Button>
		{/if}
	{/snippet}
</PageHead>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
	<Figure
		label="Accounts"
		value={users.isPending ? '—' : formatNumber(userRows.length)}
		sub="Everyone who can sign in"
	/>
	<Figure
		label="Roles"
		value={roles.isPending ? '—' : formatNumber(roleRows.length)}
		sub="Bundles of permission"
	/>
	<Figure
		label="Elevated"
		value={users.isPending ? '—' : formatNumber(admins)}
		sub="Owners and platform admins"
	/>
</div>

<div class="mt-4 flex flex-wrap items-center gap-1.5">
	{#each [{ id: 'users', label: 'Users' }, { id: 'roles', label: 'Roles' }, { id: 'audit', label: 'Audit trail' }] as option (option.id)}
		<button
			type="button"
			class="chip h-7 px-3 text-xs"
			aria-pressed={tab === option.id}
			onclick={() => (tab = option.id as Tab)}
		>
			{option.label}
		</button>
	{/each}
</div>

<!-- ── users ────────────────────────────────────────────────────────────── -->
{#if tab === 'users'}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="Accounts" sub="Roles and branch access">
			{#snippet actions()}
				<div class="field-shell h-8 min-w-[190px]">
					<Search />
					<Input
						aria-label="Search"
						class=" text-sm"
						bind:value={query}
						placeholder="Find an account…"
					/>
				</div>
			{/snippet}
		</PlateHead>

		{#if users.isPending}
			<Skeleton rows={6} />
		{:else if userRows.length === 0}
			<Empty
				icon={ShieldCheck}
				title="Only you here"
				body="Create an account for each person who needs the till, the kitchen or the back office."
			>
				{#snippet action()}
					<Button size="sm" onclick={openCreateUser}>Create an account</Button>
				{/snippet}
			</Empty>
		{:else if visibleUsers.length === 0}
			<Empty icon={Search} title="No account matches that" body="Try another name or email." />
		{:else}
			<ul class="divide-line divide-y">
				{#each visibleUsers as user (user.id)}
					<li>
						<button
							type="button"
							class="group hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
							onclick={() => openUser(user.id)}
						>
							<span
								class="border-line bg-surface-2 text-ink-2 grid size-8 shrink-0 place-items-center rounded-sm
									border text-xs font-[640]"
							>
								{user.fullName.slice(0, 2).toUpperCase()}
							</span>
							<span class="min-w-0 flex-1">
								<span class="flex flex-wrap items-center gap-2">
									<span class="text-ink truncate text-sm font-[560]">{user.fullName}</span>
									<Stamp tone={STATUS_TONE[user.status] ?? 'neutral'}
										>{humanizeEnum(user.status)}</Stamp
									>
									{#if user.isPlatformAdmin}
										<Stamp tone="brass" dot={false}>Platform</Stamp>
									{/if}
								</span>
								<span class="text-ink-3 mt-0.5 block truncate text-xs">{user.email}</span>
							</span>
							<span class="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
								{#each user.roles.slice(0, 2) as role (role)}
									<span class="chip h-6 cursor-default px-2 text-xs">{humanizeEnum(role)}</span>
								{/each}
								{#if user.roles.length > 2}
									<span class="chip-count u-num text-ink-3 self-center text-xs">
										+{user.roles.length - 2}
									</span>
								{/if}
							</span>
							<ChevronRight size={15} class="text-ink-3 shrink-0" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>

	<!-- ── roles ────────────────────────────────────────────────────────────── -->
{:else if tab === 'roles'}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="Roles" sub="Each role is a bundle of permissions" />
		{#if roles.isPending}
			<Skeleton rows={6} />
		{:else if roleRows.length === 0}
			<Empty
				icon={ShieldCheck}
				title="No roles defined"
				body="A role is the unit you assign to people — cashier, manager, accountant."
			>
				{#snippet action()}
					<Button size="sm" onclick={openCreateRole}>Create a role</Button>
				{/snippet}
			</Empty>
		{:else}
			<ul class="divide-line divide-y">
				{#each roleRows as role (role.id)}
					<li class="px-4 py-3">
						<div class="flex items-center gap-2">
							<p class="text-ink text-sm font-[560]">{humanizeEnum(role.name)}</p>
							{#if role.isSystem}<Stamp tone="slate" dot={false}>Built in</Stamp>{/if}
							<span class="u-num text-ink-3 ml-auto text-xs">
								{role.permissions.includes('*')
									? 'everything'
									: `${role.permissions.length} permissions`}
							</span>
						</div>
						{#if role.description}
							<p class="text-ink-3 mt-0.5 text-xs">{role.description}</p>
						{/if}
						<div class="mt-2 flex flex-wrap gap-1">
							{#if role.permissions.includes('*')}
								<span
									class="chip border-brass-line bg-brass-wash text-brass-ink h-6 cursor-default px-2 text-xs"
								>
									Full access
								</span>
							{:else}
								{#each role.permissions.slice(0, 8) as permission (permission)}
									<span class="chip u-mono h-6 cursor-default px-2 text-[10px]">{permission}</span>
								{/each}
								{#if role.permissions.length > 8}
									<span class="chip-count u-num text-ink-3 self-center text-xs">
										+{role.permissions.length - 8} more
									</span>
								{/if}
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>

	<!-- ── audit ────────────────────────────────────────────────────────────── -->
{:else}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="Audit trail" sub="An append-only record of what changed">
			{#snippet actions()}
				{#if audit.data?.meta}
					<span class="u-num text-ink-3 text-xs">
						{audit.data.items.length} of {formatNumber(audit.data.meta.total)}
					</span>
				{/if}
			{/snippet}
		</PlateHead>

		{#if audit.isPending}
			<Skeleton rows={8} />
		{:else if (audit.data?.items.length ?? 0) === 0}
			<Empty
				icon={ScrollText}
				title="Nothing recorded yet"
				body="Every create, update and delete writes a row here the moment it happens."
			/>
		{:else}
			<ul class="divide-line divide-y">
				{#each audit.data?.items ?? [] as entry (entry.id)}
					{@const changed = entry.newValues && Object.keys(entry.newValues).length > 0}
					<li class="px-4 py-2.5">
						<div class="flex items-start gap-3">
							<span
								class="u-mono bg-surface-3 text-ink-2 shrink-0 rounded-xs px-1.5 py-0.5 text-xs font-[600]"
							>
								{entry.action}
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-ink-2 text-[12px]">
									<span class="u-mono text-ink-3">{entry.entity}</span>
									{#if entry.entityId}
										<span class="u-mono text-ink-3">· {entry.entityId.slice(0, 8)}</span>
									{/if}
								</p>
								{#if changed}
									<p class="u-mono text-ink-3 mt-1 truncate text-xs">
										{Object.entries(entry.newValues ?? {})
											.map(([key, value]) => `${key}=${String(value)}`)
											.join('  ')}
									</p>
								{/if}
							</div>
							<span class="text-ink-3 shrink-0 text-xs" title={formatDateTime(entry.createdAt)}>
								{formatRelative(entry.createdAt)}
							</span>
						</div>
					</li>
				{/each}
			</ul>
			{#if audit.data?.meta?.hasNext}
				<p class="border-line text-ink-3 border-t px-4 py-2.5 text-center text-xs">
					The trail is longer than this page — narrow by entity or action to find a specific change.
				</p>
			{/if}
		{/if}
	</Plate>
{/if}

<!-- ── the account ──────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={openFor !== null}
	onOpenChange={(value) => {
		if (!value) openFor = null;
	}}
	title={opened?.fullName ?? 'Account'}
	sub={opened?.email}
	width={640}
>
	{#if opened}
		<FormSection title="Account details" description="Name and current account status.">
			<Field label="Full name" for="u-name">
				<Input autocomplete="name" id="u-name" class="" bind:value={userForm.fullName} />
			</Field>
			<Field label="Status" for="u-status">
				<SelectField
					id="u-status"
					class=""
					bind:value={userForm.status}
					items={[
						...['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED']
							.map((option) => [{ value: option, label: `${humanizeEnum(option)}` }])
							.flat()
					]}
				/>
			</Field>
		</FormSection>

		<p class="text-ink-3 mt-1.5 text-xs">
			Last signed in {opened.lastLoginAt ? formatRelative(opened.lastLoginAt) : 'never'} · joined {formatRelative(
				opened.createdAt
			)}
		</p>

		<div class="perf-rule my-4"></div>

		<FormSection
			title="Access permissions"
			description="Choose roles and the branches this account can use."
		>
			<Field label="Roles" hint="At least one. These replace what they had." class="mb-4">
				<div class="flex flex-wrap gap-1.5">
					{#each roleRows as role (role.id)}
						<button
							type="button"
							class="chip h-7 px-2.5 text-xs"
							aria-pressed={userForm.roles.includes(role.name)}
							onclick={() => (userForm.roles = toggle(userForm.roles, role.name))}
						>
							{#if userForm.roles.includes(role.name)}<Check size={11} />{/if}
							{humanizeEnum(role.name)}
						</button>
					{/each}
				</div>
			</Field>

			<Field
				label="Branch access"
				hint="None means every branch. These replace what they had."
				class="mb-4"
			>
				<div class="flex flex-wrap gap-1.5">
					{#each branches.data?.items ?? [] as branch (branch.id)}
						<button
							type="button"
							class="chip h-7 px-2.5 text-xs"
							aria-pressed={userForm.branchIds.includes(branch.id)}
							onclick={() => (userForm.branchIds = toggle(userForm.branchIds, branch.id))}
						>
							{#if userForm.branchIds.includes(branch.id)}<Check size={11} />{/if}
							{branch.name}
						</button>
					{/each}
				</div>
			</Field>
		</FormSection>

		{#if opened.id === $currentUser?.id}
			<p class="text-amber text-xs">
				This is your own account — removing a role here takes effect immediately.
			</p>
		{/if}
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (openFor = null)}>Cancel</Button>
		<Button disabled={userForm.roles.length === 0} onclick={saveUser}>
			<Pencil size={14} />
			Save
		</Button>
	{/snippet}
</Modal>

<!-- ── new user ─────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={userOpen}
	onOpenChange={(value) => {
		if (!value) userOpen = false;
	}}
	title="New account"
	sub="They can sign in as soon as you save"
	width={620}
>
	<FormSection title="Account details" description="Name, sign-in email and initial password.">
		<Field label="Full name" for="n-name" required>
			<Input
				autocomplete="name"
				id="n-name"
				class=""
				bind:value={newUser.fullName}
				placeholder="Sana Iqbal"
			/>
		</Field>
		<Field label="Email" for="n-email" required>
			<Input autocomplete="email" id="n-email" type="email" class="" bind:value={newUser.email} />
		</Field>
		<Field
			label="Password"
			hint="At least 10 characters."
			for="n-pass"
			required
			class="sm:col-span-2"
		>
			<Input
				minlength={10}
				autocomplete="new-password"
				id="n-pass"
				type="password"
				class=""
				bind:value={newUser.password}
			/>
		</Field>
	</FormSection>

	<FormSection
		title="Access permissions"
		description="Choose roles and the branches this account can use."
	>
		<Field label="Roles" class="mt-4">
			<div class="flex flex-wrap gap-1.5">
				{#each roleRows as role (role.id)}
					<button
						type="button"
						class="chip h-7 px-2.5 text-xs"
						aria-pressed={newUser.roles.includes(role.name)}
						onclick={() => (newUser.roles = toggle(newUser.roles, role.name))}
					>
						{#if newUser.roles.includes(role.name)}<Check size={11} />{/if}
						{humanizeEnum(role.name)}
					</button>
				{/each}
			</div>
		</Field>

		<Field label="Branch access" hint="None means every branch." class="mt-4">
			<div class="flex flex-wrap gap-1.5">
				{#each branches.data?.items ?? [] as branch (branch.id)}
					<button
						type="button"
						class="chip h-7 px-2.5 text-xs"
						aria-pressed={newUser.branchIds.includes(branch.id)}
						onclick={() => (newUser.branchIds = toggle(newUser.branchIds, branch.id))}
					>
						{branch.name}
					</button>
				{/each}
			</div>
		</Field>
	</FormSection>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (userOpen = false)}>Cancel</Button>
		<Button
			loading={creatingUser}
			disabled={!newUser.fullName.trim() ||
				!newUser.email.trim() ||
				newUser.password.length < 10 ||
				newUser.roles.length === 0}
			onclick={createUser}
		>
			Create account
		</Button>
	{/snippet}
</Modal>

<!-- ── new role ─────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={roleOpen}
	onOpenChange={(value) => {
		if (!value) roleOpen = false;
	}}
	title="New role"
	sub="Name it, then tick what it may do"
	width={680}
>
	<FormSection title="Role details" description="A recognizable name and description.">
		<Field
			label="Name"
			hint="Capitals and underscores — it is normalised for you."
			for="r-name"
			required
		>
			<Input id="r-name" class=" u-mono" bind:value={newRole.name} placeholder="FLOOR_MANAGER" />
		</Field>
		<Field label="Description" for="r-desc">
			<Input id="r-desc" class="" bind:value={newRole.description} />
		</Field>
	</FormSection>

	<div class="perf-rule my-4"></div>

	<div class="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
		{#each permissionGroups as [noun, permissions] (noun)}
			<div>
				<p class="lbl">{humanizeEnum(noun)}</p>
				<div class="flex flex-wrap gap-1.5">
					{#each permissions as permission (permission)}
						<button
							type="button"
							class="chip h-7 px-2.5 text-xs"
							aria-pressed={newRole.permissions.includes(permission)}
							onclick={() => (newRole.permissions = toggle(newRole.permissions, permission))}
						>
							{#if newRole.permissions.includes(permission)}<Check size={11} />{/if}
							{permission.split('.')[1]}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<p class="text-ink-3 mt-3 text-xs">
		{newRole.permissions.length} selected
		{#if newRole.permissions.length === 0}— a role with no permissions grants nothing{/if}
	</p>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (roleOpen = false)}>Cancel</Button>
		<Button loading={creatingRole} disabled={!newRole.name.trim()} onclick={createRole}
			>Create role</Button
		>
	{/snippet}
</Modal>

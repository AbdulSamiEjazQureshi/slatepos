<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import type { CreateBranchInput } from '@roms/contracts/tenants';
	import { DEFAULT_TENANT_SETTINGS, type TenantSettings } from '@roms/contracts/settings';
	import { api } from '#lib/api';
	import { authenticated, branchId, session } from '#lib/session';
	import { formatDateTime } from '#lib/format';
	import PageHead from '#lib/ui/page-head.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import Button from '#lib/ui/button.svelte';
	import Field from '#lib/ui/field.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Modal from '#lib/ui/modal.svelte';
	import Store from '@lucide/svelte/icons/store';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import Receipt from '@lucide/svelte/icons/receipt';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const queryClient = useQueryClient();

	const tenant = createQuery(() => ({
		queryKey: ['tenant', 'current'],
		queryFn: () => api.currentTenant(),
		enabled: $authenticated
	}));

	const branches = createQuery(() => ({
		queryKey: ['branches'],
		queryFn: () => api.listBranches(),
		enabled: $authenticated
	}));

	// ── tenant identity + trading settings ────────────────────────────────
	let name = $derived(tenant.data?.name ?? '');
	let legalName = $derived(tenant.data?.legalName ?? '');
	let currency = $derived(tenant.data?.settings.currency ?? 'PKR');
	let timezone = $derived(tenant.data?.settings.timezone ?? 'Asia/Karachi');
	let locale = $derived(tenant.data?.settings.locale ?? 'en-PK');
	let orderPrefix = $derived(tenant.data?.settings.orderPrefix ?? 'ORD');
	let serviceChargeRate = $derived(tenant.data?.settings.serviceChargeRate ?? '0');
	let receiptFooter = $derived(tenant.data?.settings.receiptFooter ?? '');
	let savingProfile = $state(false);

	/** The settings as the API last reported them — the base every partial
	 *  write is merged onto, so a PATCH never drops a key it did not touch. */
	const trading = $derived<TenantSettings>(tenant.data?.settings ?? DEFAULT_TENANT_SETTINGS);

	const saveProfile = async () => {
		savingProfile = true;
		try {
			await api.updateCurrentTenant({
				name,
				legalName: legalName || undefined,
				settings: {
					...trading,
					currency: currency.toUpperCase(),
					timezone,
					locale,
					orderPrefix,
					serviceChargeRate: serviceChargeRate || '0',
					receiptFooter: receiptFooter || null
				}
			});
			await queryClient.invalidateQueries({ queryKey: ['tenant'] });
			toast.success('Trading details saved');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save the settings');
		} finally {
			savingProfile = false;
		}
	};

	// ── tax rules: an editable ledger of rates ────────────────────────────
	let draftRate = $state('');
	let draftName = $state('');

	const rules = $derived(trading.taxRules);

	const addRule = async () => {
		if (!draftName.trim() || !draftRate.trim()) return;
		const next = [
			...trading.taxRules,
			{
				name: draftName.trim(),
				rate: draftRate.trim(),
				inclusive: false,
				appliesTo: 'ALL' as const
			}
		];
		await persistRules(next, 'Tax rule added');
		draftName = '';
		draftRate = '';
	};

	const removeRule = async (index: number) => {
		const next = trading.taxRules.filter((_rule, i) => i !== index);
		await persistRules(next, 'Tax rule removed');
	};

	const persistRules = async (next: TenantSettings['taxRules'], message: string) => {
		try {
			await api.updateCurrentTenant({ settings: { taxRules: next } });
			await queryClient.invalidateQueries({ queryKey: ['tenant'] });
			toast.success(message);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not update the tax rules');
		}
	};

	// ── branches ──────────────────────────────────────────────────────────
	let branchOpen = $state(false);
	let savingBranch = $state(false);
	let branchForm = $state<CreateBranchInput>({
		name: '',
		code: '',
		address: '',
		phone: '',
		timezone: '',
		isDefault: false
	});

	const openBranch = () => {
		branchForm = { name: '', code: '', address: '', phone: '', timezone: '', isDefault: false };
		branchOpen = true;
	};

	const createBranch = async () => {
		savingBranch = true;
		try {
			await api.createBranch({
				name: branchForm.name.trim(),
				code: branchForm.code.trim().toUpperCase(),
				...(branchForm.address ? { address: branchForm.address } : {}),
				...(branchForm.phone ? { phone: branchForm.phone } : {}),
				...(branchForm.timezone ? { timezone: branchForm.timezone } : {}),
				isDefault: branchForm.isDefault
			} as never);
			await queryClient.invalidateQueries({ queryKey: ['branches'] });
			toast.success(`${branchForm.name} opened`);
			branchOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not open the branch');
		} finally {
			savingBranch = false;
		}
	};

	const toggleBranch = async (id: string, isActive: boolean) => {
		try {
			await api.updateBranch(id, { isActive } as never);
			await queryClient.invalidateQueries({ queryKey: ['branches'] });
			toast.success(isActive ? 'Branch reopened' : 'Branch closed');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change the branch');
		}
	};

	/** A rate typed as "5" means five percent; the API wants "0.05". */
	const asRate = (value: string): string => {
		const n = Number(value);
		if (!Number.isFinite(n)) return '0';
		return String(n / 100);
	};
	const asPercent = (value: string): string => {
		const n = Number(value);
		if (!Number.isFinite(n)) return '0';
		return String(Math.round(n * 10000) / 100);
	};
</script>

<svelte:head><title>Settings — ROMS</title></svelte:head>

<PageHead title="Settings" sub="How this workspace trades — its identity, its branches and its tax">
	{#snippet actions()}
		<Button size="sm" loading={savingProfile} onclick={saveProfile}>
			<Check size={14} />
			Save changes
		</Button>
	{/snippet}
</PageHead>

{#if tenant.isPending}
	<div class="grid gap-4 lg:grid-cols-2">
		<Plate><Skeleton rows={6} /></Plate>
		<Plate><Skeleton rows={6} /></Plate>
	</div>
{:else if !tenant.data}
	<Plate>
		<Empty
			icon={Store}
			title="The workspace could not be read"
			body="Your session may have expired. Reload the page to try again."
		/>
	</Plate>
{:else}
	<div class="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
		<div class="flex flex-col gap-4">
			<!-- ── identity ─────────────────────────────────────────────── -->
			<Plate>
				<PlateHead
					title="The business"
					sub={tenant.data.slug
						? `Published at /${tenant.data.slug}`
						: 'Name, legal entity and prefix'}
				>
					{#snippet actions()}
						<Stamp tone={tenant.data.status === 'ACTIVE' ? 'herb' : 'amber'}>
							{tenant.data.status.toLowerCase()}
						</Stamp>
					{/snippet}
				</PlateHead>

				<div class="grid gap-4 p-4 sm:grid-cols-2">
					<Field label="Trading name" for="t-name">
						<Input id="t-name" class="" bind:value={name} placeholder="Slate Kitchen" />
					</Field>
					<Field label="Legal entity" hint="Appears on invoices and tax filings." for="t-legal">
						<Input
							id="t-legal"
							class=""
							bind:value={legalName}
							placeholder="Slate Foods (Pvt) Ltd"
						/>
					</Field>
					<Field label="Order prefix" hint="Tickets are numbered ORD-000123." for="t-prefix">
						<Input id="t-prefix" class=" u-mono" bind:value={orderPrefix} maxlength={8} />
					</Field>
					<Field
						label="Service charge"
						hint="Percent added to dine-in tickets. 0 to switch it off."
						for="t-service"
					>
						<div class="field-shell">
							<Input
								id="t-service"
								class=" u-num"
								value={asPercent(serviceChargeRate)}
								oninput={(event) => (serviceChargeRate = asRate(event.currentTarget.value))}
							/>
							<span class="text-ink-3 pr-3 text-[12px]">%</span>
						</div>
					</Field>
				</div>
			</Plate>

			<!-- ── money, clock and receipt ─────────────────────────────── -->
			<Plate>
				<PlateHead title="Money and time" sub="What the till prints, and which clock it trusts" />
				<div class="grid gap-4 p-4 sm:grid-cols-3">
					<Field label="Currency" hint="Three-letter ISO code." for="t-currency">
						<Input id="t-currency" class=" u-mono uppercase" maxlength={3} bind:value={currency} />
					</Field>
					<Field label="Timezone" hint="The business day closes on this clock." for="t-tz">
						<Input id="t-tz" class="" bind:value={timezone} placeholder="Asia/Karachi" />
					</Field>
					<Field label="Locale" for="t-locale">
						<Input id="t-locale" class="" bind:value={locale} placeholder="en-PK" />
					</Field>
				</div>

				<div class="perf-rule mx-4"></div>

				<div class="p-4">
					<Field
						label="Receipt footer"
						hint="Printed under every ticket. Keep it short — one or two lines."
						for="t-footer"
					>
						<Textarea
							id="t-footer"
							class=" min-h-[68px] resize-y"
							maxlength={400}
							bind:value={receiptFooter}
							placeholder="Thank you — please come again."
						></Textarea>
					</Field>
				</div>
			</Plate>

			<!-- ── tax rules: a ledger of rates ──────────────────────────── -->
			<Plate>
				<PlateHead title="Tax rules" sub="Applied to the ticket in the order they are listed">
					{#snippet actions()}
						<span class="u-num text-ink-3 text-xs">{rules.length} on file</span>
					{/snippet}
				</PlateHead>

				{#if rules.length === 0}
					<div class="px-4 py-6 text-center">
						<p class="text-ink-3 text-sm">
							No tax is being charged. Add a rate below and it applies to every new ticket.
						</p>
					</div>
				{:else}
					<table class="tbl">
						<thead>
							<tr>
								<th>Rule</th>
								<th class="tbl-num">Rate</th>
								<th class="hidden sm:table-cell">Applies to</th>
								<th style="width:44px"><span class="sr-only">Actions</span></th>
							</tr>
						</thead>
						<tbody>
							{#each rules as rule, i (rule.name + i)}
								<tr>
									<td class="text-ink font-[540]">{rule.name}</td>
									<td class="tbl-num u-num text-ink text-sm font-[600]">
										{asPercent(rule.rate)}%
									</td>
									<td class="text-ink-2 hidden text-[12px] sm:table-cell">
										{rule.appliesTo === 'ALL'
											? 'Everything'
											: rule.appliesTo === 'PRODUCT'
												? 'Named products'
												: 'Named categories'}
										{#if rule.inclusive}
											<span class="text-ink-3">· included in price</span>
										{/if}
									</td>
									<td>
										<button
											type="button"
											class="btn btn-ghost btn-icon btn-sm text-ink-3 hover:text-brick"
											aria-label="Remove {rule.name}"
											onclick={() => removeRule(i)}
										>
											<Trash2 size={14} />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}

				<div class="border-line bg-surface-2 flex flex-wrap items-end gap-3 border-t p-4">
					<Field label="Rule name" for="r-name" class="min-w-[160px] flex-1">
						<Input id="r-name" class="" bind:value={draftName} placeholder="GST" />
					</Field>
					<Field label="Rate" for="r-rate" class="w-[120px]">
						<div class="field-shell">
							<Input
								id="r-rate"
								class=" u-num"
								bind:value={draftRate}
								placeholder="5"
								inputmode="decimal"
							/>
							<span class="text-ink-3 pr-3 text-[12px]">%</span>
						</div>
					</Field>
					<Button
						size="sm"
						variant="secondary"
						disabled={!draftName.trim() || !draftRate.trim()}
						onclick={addRule}
					>
						<Plus size={14} />
						Add rate
					</Button>
				</div>
			</Plate>
		</div>

		<!-- ── branches ─────────────────────────────────────────────────── -->
		<div class="flex flex-col gap-4">
			<Plate>
				<PlateHead title="Branches" sub="Each one keeps its own stock, staff and books">
					{#snippet actions()}
						<Button size="sm" variant="outline" onclick={openBranch}>
							<Plus size={14} />
							New branch
						</Button>
					{/snippet}
				</PlateHead>

				{#if branches.isPending}
					<Skeleton rows={3} />
				{:else if (branches.data?.items ?? []).length === 0}
					<Empty
						icon={Store}
						title="No branch yet"
						body="A workspace needs at least one branch before it can take a ticket."
					>
						{#snippet action()}
							<Button size="sm" onclick={openBranch}>Open the first branch</Button>
						{/snippet}
					</Empty>
				{:else}
					<ul class="divide-line divide-y">
						{#each branches.data?.items ?? [] as branch (branch.id)}
							<li
								class="flex items-start gap-3 px-4 py-3 transition-colors
									{$branchId === branch.id ? 'bg-brass-wash' : ''}"
							>
								<span class="mt-0.5 min-w-0 flex-1">
									<span class="flex items-center gap-2">
										<span class="text-ink truncate text-sm font-[580]">{branch.name}</span>
										<span class="u-mono text-ink-3 shrink-0 text-xs">{branch.code}</span>
									</span>
									<span class="text-ink-3 mt-0.5 block truncate text-xs">
										{branch.address || 'No address on file'}
									</span>
									<span class="mt-1 flex flex-wrap items-center gap-1.5">
										{#if branch.isDefault}<Stamp tone="brass" dot={false}>Default</Stamp>{/if}
										<Stamp tone={branch.isActive ? 'herb' : 'neutral'} dot={false}>
											{branch.isActive ? 'Open' : 'Closed'}
										</Stamp>
										{#if $branchId === branch.id}
											<Stamp tone="slate" dot={false}>You are here</Stamp>
										{/if}
									</span>
								</span>
								<div class="flex shrink-0 flex-col items-end gap-1.5">
									{#if $branchId !== branch.id}
										<Button size="sm" variant="ghost" onclick={() => session.setBranch(branch.id)}>
											Switch to
										</Button>
									{/if}
									<Button
										size="sm"
										variant="ghost"
										onclick={() => toggleBranch(branch.id, !branch.isActive)}
									>
										{branch.isActive ? 'Close' : 'Reopen'}
									</Button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Plate>

			<Plate inset>
				<div class="flex items-start gap-3 p-4">
					<span
						class="bg-surface-3 text-ink-2 mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm"
					>
						<Receipt size={15} strokeWidth={1.7} />
					</span>
					<div class="min-w-0">
						<p class="text-ink text-sm font-[560]">Workspace on file since</p>
						<p class="text-ink-2 mt-1 text-[12px]">
							{formatDateTime(tenant.data.createdAt)} · last changed
							{formatDateTime(tenant.data.updatedAt)}
						</p>
					</div>
				</div>
			</Plate>
		</div>
	</div>
{/if}

<Modal
	open={branchOpen}
	onOpenChange={(value) => {
		if (!value) branchOpen = false;
	}}
	title="Open a new branch"
	sub="It starts empty — stock, staff and books follow"
	width={520}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="Branch name" for="b-name" required>
			<Input id="b-name" class="" bind:value={branchForm.name} placeholder="Gulberg" />
		</Field>
		<Field label="Code" hint="Short, uppercase, used on reports." for="b-code" required>
			<Input id="b-code" class=" u-mono uppercase" bind:value={branchForm.code} placeholder="GLB" />
		</Field>
		<Field label="Phone" for="b-phone" class="sm:col-span-2">
			<Input id="b-phone" class="" bind:value={branchForm.phone} placeholder="+92 42 111 000 000" />
		</Field>
		<Field label="Address" for="b-address" class="sm:col-span-2">
			<Textarea id="b-address" class=" min-h-[64px] resize-y" bind:value={branchForm.address}
			></Textarea>
		</Field>
		<Field
			label="Timezone"
			hint="Leave blank to inherit the workspace clock."
			for="b-tz"
			class="sm:col-span-2"
		>
			<Input id="b-tz" class="" bind:value={branchForm.timezone} placeholder="Asia/Karachi" />
		</Field>
	</div>
	<button
		type="button"
		class="mt-4 flex w-full items-center gap-2.5 text-left"
		aria-pressed={branchForm.isDefault}
		onclick={() => (branchForm.isDefault = !branchForm.isDefault)}
	>
		<span
			class="grid size-[18px] shrink-0 place-items-center rounded-xs border transition-colors
					{branchForm.isDefault ? 'border-brass bg-brass text-ground' : 'border-line-strong bg-surface'}"
		>
			{#if branchForm.isDefault}<Check size={12} strokeWidth={3} />{/if}
		</span>
		<span class="text-ink-2 text-sm">Make this the default branch for new staff</span>
	</button>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (branchOpen = false)}>Cancel</Button>
		<Button
			loading={savingBranch}
			disabled={!branchForm.name.trim() || !branchForm.code.trim()}
			onclick={createBranch}
		>
			Open branch
		</Button>
	{/snippet}
</Modal>

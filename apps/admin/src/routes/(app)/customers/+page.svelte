<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated } from '#lib/session';
	import { formatMoney, formatNumber, formatRelative, humanizeEnum } from '#lib/format';
	import { orderTone, orderLabel } from '#lib/status';
	import PageHead from '#lib/ui/page-head.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import Button from '#lib/ui/button.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Modal from '#lib/ui/modal.svelte';
	import Field from '#lib/ui/field.svelte';
	import Figure from '#lib/ui/figure.svelte';
	import Users from '@lucide/svelte/icons/users';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Phone from '@lucide/svelte/icons/phone';
	import Mail from '@lucide/svelte/icons/mail';
	import Pencil from '@lucide/svelte/icons/pencil';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	const queryClient = useQueryClient();

	let query = $state('');
	let groupFilter = $state<string | null>(null);

	const customers = createQuery(() => ({
		queryKey: ['customers', 'list'],
		// The full list: the group chips and the search box both filter here
		// rather than server-side, so the group set stays complete.
		queryFn: () => api.listCustomers({ pageSize: 200 }),
		enabled: $authenticated
	}));

	const rows = $derived(customers.data?.items ?? []);

	const groups = $derived.by(() => {
		const seen = new SvelteSet<string>();
		for (const row of rows) if (row.group) seen.add(row.group);
		return [...seen].sort();
	});

	const visible = $derived.by(() => {
		let items = rows;
		if (groupFilter) items = items.filter((row) => row.group === groupFilter);
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter((row) =>
			[row.name, row.phone, row.email].some((field) => field?.toLowerCase().includes(needle))
		);
	});

	const withPhone = $derived(rows.filter((row) => row.phone).length);

	// ── the open customer ─────────────────────────────────────────────────
	let openFor = $state<string | null>(null);
	const opened = $derived(rows.find((row) => row.id === openFor) ?? null);

	const history = createQuery(() => ({
		queryKey: ['customers', 'orders', openFor],
		queryFn: () => api.listOrders({ customerId: openFor as string, pageSize: 25 }),
		enabled: $authenticated && Boolean(openFor)
	}));

	/** What they have actually spent with us — cancelled tickets do not count. */
	const lifetime = $derived.by(() => {
		const orders = history.data?.items ?? [];
		return orders
			.filter((order) => order.status !== 'CANCELLED')
			.reduce((sum, order) => sum + Math.round(Number(order.totals.grandTotal) * 100), 0);
	});

	// ── create / edit ─────────────────────────────────────────────────────
	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let form = $state({ name: '', phone: '', email: '', group: '', notes: '' });

	const openCreate = () => {
		editingId = null;
		form = { name: '', phone: '', email: '', group: '', notes: '' };
		formOpen = true;
	};

	const openEdit = () => {
		if (!opened) return;
		editingId = opened.id;
		form = {
			name: opened.name,
			phone: opened.phone ?? '',
			email: opened.email ?? '',
			group: opened.group ?? '',
			notes: opened.notes ?? ''
		};
		formOpen = true;
	};

	const save = async () => {
		const name = form.name.trim();
		if (!name) return;
		saving = true;
		try {
			// Empty strings mean "clear it" — the API takes an explicit null for that.
			const body = {
				name,
				phone: form.phone.trim() || null,
				email: form.email.trim().toLowerCase() || null,
				group: form.group.trim() || null,
				notes: form.notes.trim() || null
			};
			if (editingId) {
				await api.updateCustomer(editingId, body);
				toast.success(`${name} updated`);
			} else {
				const created = await api.createCustomer({
					name,
					...(body.phone ? { phone: body.phone } : {}),
					...(body.email ? { email: body.email } : {}),
					...(body.group ? { group: body.group } : {}),
					...(body.notes ? { notes: body.notes } : {})
				});
				toast.success(`${name} is on the books`);
				openFor = created.id;
			}
			await queryClient.invalidateQueries({ queryKey: ['customers'] });
			formOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save the customer');
		} finally {
			saving = false;
		}
	};
</script>

<svelte:head><title>Customers — ROMS</title></svelte:head>

<PageHead title="Customers" sub="Who they are, what they have spent and what they are owed">
	{#snippet actions()}
		<Button size="sm" onclick={openCreate}>
			<Plus size={14} />
			Add a customer
		</Button>
	{/snippet}
</PageHead>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
	<Figure
		label="On the books"
		value={customers.isPending ? '—' : formatNumber(rows.length)}
		sub="Everyone with a profile"
	/>
	<Figure
		label="Reachable"
		value={customers.isPending ? '—' : formatNumber(withPhone)}
		sub="Have a phone number on file"
	/>
	<Figure
		label="Groups"
		value={customers.isPending ? '—' : formatNumber(groups.length)}
		sub={groups.length ? groups.slice(0, 2).join(', ') : 'None yet'}
	/>
</div>

<Plate class="mt-4 overflow-hidden">
	<PlateHead title="Directory" sub="Search by name, phone or email">
		{#snippet actions()}
			<div class="field-shell h-8 min-w-[200px]">
				<Search />
				<Input class=" text-sm" bind:value={query} placeholder="Find a customer…" />
			</div>
		{/snippet}
	</PlateHead>

	{#if groups.length}
		<div class="border-line flex flex-wrap gap-1.5 border-b px-4 py-2.5">
			<button
				type="button"
				class="chip h-7 px-2.5 text-xs"
				aria-pressed={groupFilter === null}
				onclick={() => (groupFilter = null)}
			>
				Everyone
			</button>
			{#each groups as group (group)}
				<button
					type="button"
					class="chip h-7 px-2.5 text-xs"
					aria-pressed={groupFilter === group}
					onclick={() => (groupFilter = groupFilter === group ? null : group)}
				>
					{group}
				</button>
			{/each}
		</div>
	{/if}

	{#if customers.isPending}
		<Skeleton rows={7} />
	{:else if rows.length === 0}
		<Empty
			icon={Users}
			title="No customers yet"
			body="A profile keeps their number on the ticket, their points on the books and their history in one place."
		>
			{#snippet action()}
				<Button size="sm" onclick={openCreate}>Add a customer</Button>
			{/snippet}
		</Empty>
	{:else if visible.length === 0}
		<Empty
			icon={Search}
			title="Nobody matches that"
			body="Try a different name, number or group."
		/>
	{:else}
		<ul class="divide-line divide-y">
			{#each visible as customer (customer.id)}
				<li>
					<button
						type="button"
						class="group hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
						onclick={() => (openFor = customer.id)}
					>
						<span
							class="border-line bg-surface-2 text-ink-2 grid size-8 shrink-0 place-items-center rounded-sm
								border text-xs font-[640] tracking-[0.02em]"
						>
							{customer.name.slice(0, 2).toUpperCase()}
						</span>
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-2">
								<span class="text-ink truncate text-sm font-[560]">{customer.name}</span>
								{#if customer.group}<Stamp tone="slate">{customer.group}</Stamp>{/if}
							</span>
							<span class="text-ink-3 mt-0.5 block truncate text-xs">
								{customer.phone || customer.email || 'No contact details'}
							</span>
						</span>
						{#if customer.loyaltyPoints > 0}
							<span class="u-num text-brass-ink shrink-0 text-xs font-[600]">
								{customer.loyaltyPoints} pts
							</span>
						{/if}
						<span class="u-num text-ink-2 hidden shrink-0 text-[12px] sm:block">
							{formatMoney(customer.walletBalance)}
						</span>
						<ChevronRight size={15} class="text-ink-3 shrink-0" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Plate>

<!-- ── the customer ─────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={openFor !== null}
	onOpenChange={(value) => {
		if (!value) openFor = null;
	}}
	title={opened?.name ?? 'Customer'}
	width={720}
>
	{#if opened}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<Figure
				label="Lifetime value"
				value={history.isPending ? '—' : formatMoney(String(lifetime / 100))}
				sub="Cancelled tickets excluded"
				wide
			/>
			<Figure
				label="Loyalty"
				value={formatNumber(opened.loyaltyPoints)}
				unit="pts"
				sub="Earned across every visit"
			/>
			<Figure
				label="Wallet"
				value={formatMoney(opened.walletBalance)}
				sub={Number(opened.walletBalance) > 0 ? 'Credit on account' : 'Nothing on account'}
			/>
		</div>

		<dl class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
			<div>
				<dt class="u-label">Phone</dt>
				<dd class="text-ink mt-1 flex items-center gap-1.5 text-sm">
					<Phone size={13} class="text-ink-3" />
					{opened.phone ?? '—'}
				</dd>
			</div>
			<div>
				<dt class="u-label">Email</dt>
				<dd class="text-ink mt-1 flex items-center gap-1.5 text-sm">
					<Mail size={13} class="text-ink-3" />
					<span class="truncate">{opened.email ?? '—'}</span>
				</dd>
			</div>
			<div>
				<dt class="u-label">Group</dt>
				<dd class="text-ink mt-1 text-sm">{opened.group ?? '—'}</dd>
			</div>
			<div>
				<dt class="u-label">First seen</dt>
				<dd class="text-ink mt-1 text-sm">{formatRelative(opened.createdAt)}</dd>
			</div>
			{#if opened.notes}
				<div class="sm:col-span-2">
					<dt class="u-label">Notes</dt>
					<dd class="text-ink-2 mt-1 text-sm leading-relaxed">{opened.notes}</dd>
				</div>
			{/if}
		</dl>

		<div class="perf-rule my-4"></div>

		<div class="flex items-center justify-between">
			<p class="u-label">Visit history</p>
			{#if !history.isPending && (history.data?.items.length ?? 0) > 0}
				<p class="u-num text-ink-3 text-xs">
					{history.data?.items.length} of {history.data?.meta.total}
				</p>
			{/if}
		</div>

		{#if history.isPending}
			<Skeleton rows={3} />
		{:else if (history.data?.items.length ?? 0) === 0}
			<div class="border-line mt-2 rounded-sm border border-dashed py-8 text-center">
				<p class="text-ink-2 text-sm font-[540]">No tickets yet</p>
				<p class="text-ink-3 mx-auto mt-1 max-w-[36ch] text-xs">
					Attach them to a ticket on the POS and their visits land here.
				</p>
			</div>
		{:else}
			<ul class="divide-line mt-2 divide-y">
				{#each history.data?.items ?? [] as order (order.id)}
					<li class="flex items-center gap-3 py-2.5">
						<ReceiptText size={15} class="text-ink-3 shrink-0" />
						<div class="min-w-0 flex-1">
							<p class="u-mono text-ink text-[12px] font-[600]">{order.number}</p>
							<p class="text-ink-3 text-xs">
								{formatRelative(order.createdAt)} · {humanizeEnum(order.type)}
							</p>
						</div>
						<Stamp tone={orderTone(order.status)}>{orderLabel(order.status)}</Stamp>
						<p class="u-num text-ink w-[86px] shrink-0 text-right text-sm font-[600]">
							{formatMoney(order.totals.grandTotal)}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (openFor = null)}>Close</Button>
		<Button variant="outline" onclick={openEdit}>
			<Pencil size={14} />
			Edit profile
		</Button>
	{/snippet}
</Modal>

<!-- ── create / edit ────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={formOpen}
	onOpenChange={(value) => {
		if (!value) formOpen = false;
	}}
	title={editingId ? 'Edit profile' : 'Add a customer'}
	sub={editingId ? 'Phone, email and group can all be cleared' : 'A name is all that is required'}
	width={560}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="Name" for="c-name" required class="sm:col-span-2">
			<Input id="c-name" class="" bind:value={form.name} placeholder="Ayesha Malik" />
		</Field>
		<Field label="Phone" hint="Unique per customer — used to find them at the till." for="c-phone">
			<Input id="c-phone" class="" bind:value={form.phone} placeholder="+92 300 0000000" />
		</Field>
		<Field label="Email" for="c-email">
			<Input id="c-email" type="email" class="" bind:value={form.email} />
		</Field>
		<Field
			label="Group"
			hint="Free text — becomes a filter chip above."
			for="c-group"
			class="sm:col-span-2"
		>
			<Input id="c-group" class="" bind:value={form.group} placeholder="Regulars" />
		</Field>
		<Field label="Notes" for="c-notes" class="sm:col-span-2">
			<Textarea
				id="c-notes"
				class=" min-h-[62px] resize-y"
				bind:value={form.notes}
				placeholder="Allergic to nuts. Prefers the corner table."
			></Textarea>
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (formOpen = false)}>Cancel</Button>
		<Button loading={saving} disabled={!form.name.trim()} onclick={save}>
			{editingId ? 'Save changes' : 'Add customer'}
		</Button>
	{/snippet}
</Modal>

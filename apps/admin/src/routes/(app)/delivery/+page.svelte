<script lang="ts">
	import SelectField from '#lib/ui/select-field.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { onMount } from 'svelte';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { api, type DeliveryStatus } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import { onRealtime } from '#lib/realtime';
	import { litKeys, isLit } from '#lib/live';
	import {
		formatDateTime,
		formatMoney,
		formatNumber,
		formatPercent,
		formatRelative,
		formatTime,
		initials,
		titleCase,
		todayISO,
		shiftDay
	} from '#lib/format';
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
	import Bike from '@lucide/svelte/icons/bike';
	import Plus from '@lucide/svelte/icons/plus';
	import Phone from '@lucide/svelte/icons/phone';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Navigation from '@lucide/svelte/icons/navigation';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Send from '@lucide/svelte/icons/send';
	import Wallet from '@lucide/svelte/icons/wallet';

	const queryClient = useQueryClient();

	let tab = $state<'board' | 'riders' | 'zones'>('board');

	const deliveries = createQuery(() => ({
		queryKey: ['delivery', 'list', $branchId],
		queryFn: () => api.listDeliveries({ branchId: $branchId ?? undefined, pageSize: 100 }),
		enabled: $authenticated
	}));

	const riders = createQuery(() => ({
		queryKey: ['delivery', 'riders'],
		queryFn: () => api.listRiders(),
		enabled: $authenticated
	}));

	const zones = createQuery(() => ({
		queryKey: ['delivery', 'zones', $branchId],
		queryFn: () => api.listZones({ branchId: $branchId ?? undefined }),
		enabled: $authenticated
	}));

	const branches = createQuery(() => ({
		queryKey: ['branches'],
		queryFn: () => api.listBranches(),
		enabled: $authenticated
	}));

	/**
	 * Delivery tickets are keyed by order, and the delivery row carries only the
	 * order id. The order list is what turns `3f9a…` back into #1042 with a total
	 * on it — and it is the same list the dispatch picker needs.
	 */
	const orders = createQuery(() => ({
		queryKey: ['orders', 'list', 'delivery', $branchId],
		// Branch-scoped, like the board it feeds: dispatching another branch's
		// ticket from this counter would send a bag out of the wrong kitchen.
		queryFn: () => api.listOrders({ pageSize: 100, branchId: $branchId ?? undefined }),
		enabled: $authenticated
	}));

	onMount(() => {
		const dispose = onRealtime((event) => {
			if (event.type.startsWith('order.') || event.type === 'payment.status_changed') {
				queryClient.invalidateQueries({ queryKey: ['delivery'] });
				queryClient.invalidateQueries({ queryKey: ['orders', 'list', 'delivery'] });
			}
		});
		return dispose;
	});

	const all = $derived(deliveries.data?.items ?? []);
	const riderRows = $derived(riders.data ?? []);
	const zoneRows = $derived(zones.data ?? []);
	const orderById = $derived(
		new SvelteMap((orders.data?.items ?? []).map((order) => [order.id, order]))
	);

	/** The board's four open lanes, in the order a bag moves through them. */
	const LANES = [
		{
			status: 'PENDING' as DeliveryStatus,
			label: 'Waiting for a rider',
			hint: 'Nobody has it yet'
		},
		{
			status: 'ASSIGNED' as DeliveryStatus,
			label: 'With a rider',
			hint: 'Asked for, not collected'
		},
		{ status: 'PICKED_UP' as DeliveryStatus, label: 'On the road', hint: 'Left the counter' },
		{ status: 'DELIVERED' as DeliveryStatus, label: 'Delivered', hint: 'Handed over today' }
	];

	/**
	 * The open lanes are the live board; the Delivered lane is today's work, so
	 * it is bounded to today. Otherwise "Handed over today" would be a promise
	 * the column breaks as soon as the page carries more than one day's runs.
	 */
	const lane = (status: DeliveryStatus) =>
		all.filter((row) =>
			status === 'DELIVERED'
				? row.status === 'DELIVERED' && isToday(row.deliveredAt)
				: row.status === status
		);
	const offBoard = $derived(
		all.filter((row) => row.status === 'FAILED' || row.status === 'CANCELLED')
	);

	const counting = $derived({
		waiting: lane('PENDING').length,
		riding: lane('ASSIGNED').length + lane('PICKED_UP').length,
		delivered: lane('DELIVERED').length
	});

	/**
	 * Money is an exact decimal string, so a sum is taken in minor units as
	 * integers — never by adding the strings' float values together.
	 */
	const sumMoney = (values: (string | null | undefined)[]) =>
		values.reduce((total, value) => total + Math.round(Number(value ?? 0) * 100), 0) / 100;

	const takenToday = $derived(
		formatMoney(
			sumMoney(
				all
					.filter((row) => row.status === 'DELIVERED' && isToday(row.deliveredAt))
					.map((row) => row.fee)
			)
		)
	);

	function isToday(value: string | Date | null) {
		if (!value) return false;
		return new Date(value).toDateString() === new Date().toDateString();
	}

	const riderName = (id: string | null) =>
		riderRows.find((rider) => rider.id === id)?.name ?? 'Unassigned';
	const zoneName = (id: string | null) => zoneRows.find((zone) => zone.id === id)?.name ?? null;
	const branchName = (id: string) =>
		branches.data?.items.find((row) => row.id === id)?.name ?? 'Branch';
	const orderNumber = (orderId: string) =>
		orderById.get(orderId)?.number ?? orderId.slice(0, 6).toUpperCase();
	const orderTotal = (orderId: string) => orderById.get(orderId)?.totals.grandTotal ?? null;

	/** How many open bags each rider is already carrying — the load-balancing read. */
	const load = $derived.by(() => {
		const map = new SvelteMap<string, number>();
		for (const row of all) {
			if (
				row.riderId &&
				row.status !== 'DELIVERED' &&
				row.status !== 'FAILED' &&
				row.status !== 'CANCELLED'
			) {
				map.set(row.riderId, (map.get(row.riderId) ?? 0) + 1);
			}
		}
		return map;
	});

	/**
	 * A rider's completed runs and the fees they carried. Bounded to the window
	 * the board loaded rather than to a calendar month — the label says so,
	 * because a number that silently means "whatever the page fetched" is worse
	 * than no number.
	 */
	const riderRun = (riderId: string) => {
		const done = all.filter((row) => row.riderId === riderId && row.status === 'DELIVERED');
		return { runs: done.length, fees: sumMoney(done.map((row) => row.fee)) };
	};

	// ── moving a ticket along ─────────────────────────────────────────────
	let busy = $state<string | null>(null);

	const advance = async (id: string, status: DeliveryStatus, note: string) => {
		busy = id;
		try {
			await api.setDeliveryStatus(id, status);
			await queryClient.invalidateQueries({ queryKey: ['delivery'] });
			toast.success(note);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not move that delivery');
		} finally {
			busy = null;
		}
	};

	// ── assigning ─────────────────────────────────────────────────────────
	let assignFor = $state<string | null>(null);
	let assignRiderId = $state<string | null>(null);
	let assigning = $state(false);

	const openAssign = (id: string, current: string | null) => {
		assignFor = id;
		assignRiderId = current;
	};

	const confirmAssign = async () => {
		if (!assignFor || !assignRiderId) return;
		assigning = true;
		try {
			await api.assignRider(assignFor, assignRiderId);
			await queryClient.invalidateQueries({ queryKey: ['delivery'] });
			toast.success(`${riderName(assignRiderId)} has the bag`);
			assignFor = null;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not assign that rider');
		} finally {
			assigning = false;
		}
	};

	// ── dispatching a ticket that has no delivery yet ─────────────────────
	let dispatchOpen = $state(false);
	let dispatching = $state(false);
	let dispatch = $state({ orderId: '', zoneId: '', riderId: '', address: '' });

	const undelivered = $derived(
		(orders.data?.items ?? []).filter(
			(order) => order.type === 'DELIVERY' && !all.some((row) => row.orderId === order.id)
		)
	);

	const openDispatch = () => {
		dispatch = { orderId: undelivered[0]?.id ?? '', zoneId: '', riderId: '', address: '' };
		dispatchOpen = true;
	};

	const confirmDispatch = async () => {
		if (!dispatch.orderId) return;
		dispatching = true;
		try {
			await api.createDelivery({
				orderId: dispatch.orderId,
				...(dispatch.zoneId ? { zoneId: dispatch.zoneId } : {}),
				...(dispatch.riderId ? { riderId: dispatch.riderId } : {}),
				...(dispatch.address.trim() ? { address: dispatch.address.trim() } : {})
			});
			await queryClient.invalidateQueries({ queryKey: ['delivery'] });
			toast.success('On the board');
			dispatchOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not dispatch that ticket');
		} finally {
			dispatching = false;
		}
	};

	// ── new rider / new zone ──────────────────────────────────────────────
	let riderOpen = $state(false);
	let savingRider = $state(false);
	let riderForm = $state({ name: '', phone: '', vehicle: 'Bike', percent: '10' });

	const saveRider = async () => {
		if (!riderForm.name.trim()) return;
		savingRider = true;
		try {
			await api.createRider({
				name: riderForm.name.trim(),
				...(riderForm.phone.trim() ? { phone: riderForm.phone.trim() } : {}),
				...(riderForm.vehicle.trim() ? { vehicle: riderForm.vehicle.trim() } : {}),
				// A percent typed as "10" means ten per cent; the API wants "0.10".
				commissionRate: String((Number(riderForm.percent) || 0) / 100)
			});
			await queryClient.invalidateQueries({ queryKey: ['delivery', 'riders'] });
			toast.success(`${riderForm.name.trim()} is on the roster`);
			riderOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not add that rider');
		} finally {
			savingRider = false;
		}
	};

	let zoneOpen = $state(false);
	let savingZone = $state(false);
	let zoneForm = $state({ name: '', fee: '0', minOrder: '0', branchId: '' });

	const openZone = () => {
		zoneForm = {
			name: '',
			fee: '0',
			minOrder: '0',
			branchId: $branchId ?? branches.data?.items[0]?.id ?? ''
		};
		zoneOpen = true;
	};

	const saveZone = async () => {
		if (!zoneForm.name.trim() || !zoneForm.branchId) return;
		savingZone = true;
		try {
			await api.createZone({
				branchId: zoneForm.branchId,
				name: zoneForm.name.trim(),
				fee: zoneForm.fee || '0',
				minOrder: zoneForm.minOrder || '0'
			});
			await queryClient.invalidateQueries({ queryKey: ['delivery', 'zones'] });
			toast.success(`${zoneForm.name.trim()} added`);
			zoneOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not add that zone');
		} finally {
			savingZone = false;
		}
	};

	// ── settling a rider ──────────────────────────────────────────────────
	let settleFor = $state<string | null>(null);
	let settling = $state(false);
	let settled = $state<{ orderCount: number; amount: string } | null>(null);
	let period = $state({ from: shiftDay(todayISO(), -6), to: todayISO() });

	const openSettle = (riderId: string) => {
		settleFor = riderId;
		settled = null;
		period = { from: shiftDay(todayISO(), -6), to: todayISO() };
	};

	const confirmSettle = async () => {
		if (!settleFor) return;
		settling = true;
		try {
			const result = (await api.settleRider({
				riderId: settleFor,
				// The window is inclusive on both ends and built from the
				// cashier's own calendar, because "the shift that ends at
				// midnight" is the local midnight, not UTC's. `toISOString`
				// does the conversion; the route wants the offset form.
				periodStart: new Date(`${period.from}T00:00:00`).toISOString(),
				periodEnd: new Date(`${period.to}T23:59:59`).toISOString()
			})) as { orderCount: number; amount: string };
			settled = result;
			toast.success(`Settled ${formatMoney(result.amount)} for ${result.orderCount} runs`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not settle that rider');
		} finally {
			settling = false;
		}
	};
</script>

<svelte:head><title>Delivery — ROMS</title></svelte:head>

<PageHead title="Delivery" sub="Where every bag is, and who is carrying it">
	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={openZone}>
			<MapPin size={14} />
			New zone
		</Button>
		<Button size="sm" onclick={openDispatch} disabled={undelivered.length === 0}>
			<Send size={14} />
			Dispatch a ticket
		</Button>
	{/snippet}
</PageHead>

<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
	<Figure
		label="Waiting for a rider"
		value={deliveries.isPending ? '—' : formatNumber(counting.waiting)}
		sub="Nobody has picked these up"
		deltaTone={counting.waiting > 0 ? 'brick' : 'neutral'}
		delta={counting.waiting > 0 ? 'needs cover' : undefined}
	/>
	<Figure
		label="With a rider"
		value={deliveries.isPending ? '—' : formatNumber(counting.riding)}
		sub="Assigned or already moving"
	/>
	<Figure
		label="Delivered today"
		value={deliveries.isPending ? '—' : formatNumber(counting.delivered)}
		sub="Handed over since midnight"
	/>
	<Figure
		label="Fees taken today"
		value={deliveries.isPending ? '—' : takenToday}
		sub="On delivered runs only"
	/>
</div>

<div class="tabs mt-4">
	{#each [{ id: 'board', label: 'Board' }, { id: 'riders', label: 'Riders' }, { id: 'zones', label: 'Zones' }] as item (item.id)}
		<button
			type="button"
			class="tab"
			class:is-active={tab === item.id}
			onclick={() => (tab = item.id as typeof tab)}
		>
			{item.label}
		</button>
	{/each}
</div>

{#if deliveries.isPending}
	<Plate class="mt-3 overflow-hidden">
		<Skeleton rows={7} />
	</Plate>
{:else if tab === 'board'}
	{#if all.length === 0}
		<Plate class="mt-3 overflow-hidden">
			<Empty
				icon={Bike}
				title="Nothing on the road"
				body="A ticket lands here the moment a delivery is raised against it — assign a rider, then walk it through pickup and delivery from this board."
			>
				{#snippet action()}
					<Button size="sm" onclick={openDispatch} disabled={undelivered.length === 0}>
						Dispatch a ticket
					</Button>
				{/snippet}
			</Empty>
		</Plate>
	{:else}
		<div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{#each LANES as laneDef (laneDef.status)}
				{@const rows = lane(laneDef.status)}
				<section class="flex flex-col gap-3">
					<header class="flex items-baseline justify-between gap-2 px-0.5">
						<div class="min-w-0">
							<p class="u-label">{laneDef.label}</p>
							<p class="text-ink-3 mt-0.5 text-xs">{laneDef.hint}</p>
						</div>
						<span class="u-num text-ink-2 text-sm font-[620]">{rows.length}</span>
					</header>

					{#if rows.length === 0}
						<div
							class="border-line text-ink-3 rounded-md border border-dashed px-3 py-6 text-center text-xs"
						>
							Nothing here
						</div>
					{/if}

					{#each rows as row (row.id)}
						<article
							class="ticket anim-rise hover:shadow-2 overflow-hidden transition-shadow duration-200"
							class:row-lit={isLit($litKeys, `order:${row.orderId}`)}
						>
							<div class="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
								<div class="min-w-0">
									<p class="u-mono text-ink text-sm font-[640]">
										#{orderNumber(row.orderId)}
									</p>
									{#if orderTotal(row.orderId)}
										<p class="u-num text-ink-3 mt-0.5 text-xs">
											ticket {formatMoney(orderTotal(row.orderId))}
										</p>
									{/if}
								</div>
								<span class="u-num text-ink-3 shrink-0 text-xs"
									>{formatRelative(row.createdAt)}</span
								>
							</div>

							{#if row.address}
								<p class="text-ink-2 line-clamp-2 px-3 pb-2 text-[12px]">{row.address}</p>
							{/if}

							<div class="perf-rule mx-3"></div>

							<!-- the stub: who has it, and what the run is worth -->
							<div class="flex items-center gap-2.5 px-3 py-2.5">
								{#if row.riderId}
									<span
										class="u-num border-line bg-surface-2 text-ink-2 flex size-6 shrink-0 items-center justify-center rounded-full border text-[9.5px] font-[640]"
									>
										{initials(riderName(row.riderId))}
									</span>
									<div class="min-w-0 flex-1">
										<p class="text-ink truncate text-[12px] font-[550]">{riderName(row.riderId)}</p>
										<p class="text-ink-3 truncate text-xs">
											{zoneName(row.zoneId) ?? titleCase(row.provider)}
										</p>
									</div>
								{:else}
									<!-- Keeps breathing while nobody has the bag, and stops
									     breathing under reduced motion like every other
									     animation here — the word beside it still says
									     "No rider yet", so nothing is lost. -->
									<span
										class="size-2 shrink-0 rounded-full bg-[var(--brass)]"
										style="animation: roms-pulse 1.8s var(--ease-out) infinite"
									></span>
									<div class="min-w-0 flex-1">
										<p class="text-brass-ink text-[12px] font-[550]">No rider yet</p>
										<p class="text-ink-3 text-xs">{zoneName(row.zoneId) ?? 'Unzoned'}</p>
									</div>
								{/if}
								<span class="u-num text-ink-2 shrink-0 text-[12px] font-[600]"
									>{formatMoney(row.fee)}</span
								>
							</div>

							<div class="border-line flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
								{#if row.status === 'PENDING'}
									<Button size="sm" class="btn-sm" onclick={() => openAssign(row.id, row.riderId)}>
										<Navigation size={13} />
										Assign
									</Button>
								{:else if row.status === 'ASSIGNED'}
									<Button
										size="sm"
										class="btn-sm"
										loading={busy === row.id}
										onclick={() =>
											advance(row.id, 'PICKED_UP', `#${orderNumber(row.orderId)} picked up`)}
									>
										<Bike size={13} />
										Picked up
									</Button>
									<Button size="sm" variant="ghost" onclick={() => openAssign(row.id, row.riderId)}>
										Reassign
									</Button>
								{:else if row.status === 'PICKED_UP'}
									<Button
										size="sm"
										class="btn-sm"
										loading={busy === row.id}
										onclick={() =>
											advance(row.id, 'DELIVERED', `#${orderNumber(row.orderId)} delivered`)}
									>
										<Check size={13} />
										Delivered
									</Button>
								{:else}
									<span class="text-herb inline-flex items-center gap-1.5 text-xs">
										<Check size={13} />
										{row.deliveredAt ? formatTime(row.deliveredAt) : 'Delivered'}
									</span>
								{/if}

								{#if row.status !== 'DELIVERED'}
									<Button
										size="sm"
										variant="ghost"
										class="btn-sm text-ink-3 hover:text-brick ml-auto"
										loading={busy === row.id}
										onclick={() =>
											advance(row.id, 'FAILED', `#${orderNumber(row.orderId)} marked failed`)}
									>
										<X size={13} />
										Failed
									</Button>
								{/if}
							</div>
						</article>
					{/each}
				</section>
			{/each}
		</div>

		{#if offBoard.length > 0}
			<Plate class="mt-4 overflow-hidden">
				<PlateHead
					title="Off the board"
					sub="Runs that did not land — kept so the reason is not lost"
				/>
				<ul class="divide-line divide-y">
					{#each offBoard as row (row.id)}
						<li class="flex items-center gap-3 px-4 py-2.5">
							<Stamp tone={row.status === 'FAILED' ? 'brick' : 'neutral'}>
								{row.status === 'FAILED' ? 'Failed' : 'Cancelled'}
							</Stamp>
							<span class="u-mono text-ink text-[12px] font-[600]">#{orderNumber(row.orderId)}</span
							>
							<span class="text-ink-3 min-w-0 flex-1 truncate text-xs">
								{riderName(row.riderId)} · {formatDateTime(row.updatedAt)}
							</span>
							<span class="u-num text-ink-3 text-xs">{formatMoney(row.fee)}</span>
						</li>
					{/each}
				</ul>
			</Plate>
		{/if}
	{/if}
{:else if tab === 'riders'}
	<Plate class="mt-3 overflow-hidden">
		<PlateHead title="Riders" sub="Commission is a share of the delivery fee on runs they complete">
			{#snippet actions()}
				<Button size="sm" onclick={() => (riderOpen = true)}>
					<Plus size={14} />
					Add rider
				</Button>
			{/snippet}
		</PlateHead>

		{#if riders.isPending}
			<Skeleton rows={5} />
		{:else if riderRows.length === 0}
			<Empty
				icon={Bike}
				title="No riders on the books"
				body="Add the people who carry the bags, set their cut of the delivery fee, and settle them per period from here."
			>
				{#snippet action()}
					<Button size="sm" onclick={() => (riderOpen = true)}>Add the first rider</Button>
				{/snippet}
			</Empty>
		{:else}
			<ul class="divide-line divide-y">
				{#each riderRows as rider (rider.id)}
					{@const run = riderRun(rider.id)}
					{@const carrying = load.get(rider.id) ?? 0}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
						<span
							class="u-num border-line bg-surface-2 text-ink-2 flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-[640]"
						>
							{initials(rider.name)}
						</span>

						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-ink text-sm font-[560]">{rider.name}</p>
								{#if carrying > 0}
									<Stamp tone="brass">{carrying} on the road</Stamp>
								{/if}
								{#if !rider.isActive}
									<Stamp tone="neutral">Off the roster</Stamp>
								{/if}
							</div>
							<div class="text-ink-3 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
								{#if rider.vehicle}<span>{rider.vehicle}</span>{/if}
								{#if rider.phone}
									<span class="u-num inline-flex items-center gap-1">
										<Phone size={11} />
										{rider.phone}
									</span>
								{/if}
								<span class="u-num"
									>{formatPercent(
										Number(rider.commissionRate),
										(Number(rider.commissionRate) * 100) % 1 === 0 ? 0 : 1
									)} commission</span
								>
							</div>
						</div>

						<div class="text-right">
							<p class="u-num text-ink text-sm font-[600]">
								{formatNumber(run.runs)} <span class="text-ink-3 text-xs font-[400]">runs</span>
							</p>
							<p class="u-num text-ink-3 text-xs">
								{formatMoney(run.fees)} carried on this board
							</p>
						</div>

						<Button size="sm" variant="ghost" onclick={() => openSettle(rider.id)}>
							<Wallet size={13} />
							Settle
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>
{:else}
	<Plate class="mt-3 overflow-hidden">
		<PlateHead title="Zones" sub="A zone is a delivery fee and a minimum order for an area">
			{#snippet actions()}
				<Button size="sm" onclick={openZone}>
					<Plus size={14} />
					New zone
				</Button>
			{/snippet}
		</PlateHead>

		{#if zones.isPending}
			<Skeleton rows={4} />
		{:else if zoneRows.length === 0}
			<Empty
				icon={MapPin}
				title="No delivery zones"
				body="Zones decide what a run costs the customer and how far an order has to go before it is worth sending."
			>
				{#snippet action()}
					<Button size="sm" onclick={openZone}>Define a zone</Button>
				{/snippet}
			</Empty>
		{:else}
			<ul class="divide-line divide-y">
				{#each zoneRows as zone (zone.id)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="text-ink text-sm font-[560]">{zone.name}</p>
								{#if !zone.isActive}<Stamp tone="neutral">Closed</Stamp>{/if}
							</div>
							<p class="text-ink-3 mt-0.5 text-xs">{branchName(zone.branchId)}</p>
						</div>
						<div class="text-right">
							<p class="u-num text-ink text-sm font-[600]">{formatMoney(zone.fee)}</p>
							<p class="u-num text-ink-3 text-xs">
								{Number(zone.minOrder) > 0 ? `min ${formatMoney(zone.minOrder)}` : 'no minimum'}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>
{/if}

<!-- ── assign a rider ───────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={Boolean(assignFor)}
	onOpenChange={(value) => {
		if (!value) assignFor = null;
	}}
	title="Who is carrying it?"
	sub="Riders already out are shown with the load they are holding"
	width={440}
>
	{#if riderRows.length === 0}
		<p class="text-ink-3 text-sm">There are no riders yet. Add one from the Riders tab first.</p>
	{:else}
		<ul class="divide-line border-line divide-y rounded-md border">
			{#each riderRows.filter((rider) => rider.isActive) as rider (rider.id)}
				{@const carrying = load.get(rider.id) ?? 0}
				<li>
					<button
						type="button"
						class="hover:bg-surface-2 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150"
						class:bg-brass-wash={assignRiderId === rider.id}
						onclick={() => (assignRiderId = rider.id)}
					>
						<span
							class="u-num border-line bg-surface-2 text-ink-2 flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-[640]"
						>
							{initials(rider.name)}
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm font-[550]">{rider.name}</p>
							<p class="text-ink-3 text-xs">
								{rider.vehicle ?? 'No vehicle'} · {formatPercent(Number(rider.commissionRate), 0)} commission
							</p>
						</div>
						{#if carrying > 0}
							<span class="chip-count u-num">{carrying} out</span>
						{:else}
							<span class="text-herb text-xs">free</span>
						{/if}
						{#if assignRiderId === rider.id}
							<Check size={14} class="text-brass-ink" />
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (assignFor = null)}>Cancel</Button>
		<Button loading={assigning} disabled={!assignRiderId} onclick={confirmAssign}
			>Assign rider</Button
		>
	{/snippet}
</Modal>

<!-- ── dispatch a ticket ────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={dispatchOpen}
	onOpenChange={(value) => {
		if (!value) dispatchOpen = false;
	}}
	title="Dispatch a ticket"
	sub="Delivery tickets raised at the till that nobody has been sent out with"
	width={520}
>
	{#if undelivered.length === 0}
		<p class="text-ink-3 text-sm">
			Every delivery ticket in the last stretch already has a run against it.
		</p>
	{:else}
		<div class="grid gap-4">
			<Field label="Ticket" for="dp-order" required>
				<SelectField
					id="dp-order"
					class=""
					bind:value={dispatch.orderId}
					items={[
						...undelivered
							.map((order) => [
								{
									value: order.id,
									label: `#${order.number} · ${formatMoney(order.totals.grandTotal)} · ${formatRelative(
										order.createdAt
									)}`
								}
							])
							.flat()
					]}
				/>
			</Field>

			<div class="grid gap-4 sm:grid-cols-2">
				<Field label="Zone" hint="Sets the fee charged for the run." for="dp-zone">
					<SelectField
						id="dp-zone"
						class=""
						bind:value={dispatch.zoneId}
						items={[
							{ value: '', label: `No zone` },
							...zoneRows
								.map((zone) => [
									{ value: zone.id, label: `${zone.name} · ${formatMoney(zone.fee)}` }
								])
								.flat()
						]}
					/>
				</Field>
				<Field label="Rider" hint="Leave blank to leave it waiting." for="dp-rider">
					<SelectField
						id="dp-rider"
						class=""
						bind:value={dispatch.riderId}
						items={[
							{ value: '', label: `Nobody yet` },
							...riderRows
								.filter((rider) => rider.isActive)
								.map((rider) => [{ value: rider.id, label: `${rider.name}` }])
								.flat()
						]}
					/>
				</Field>
			</div>

			<Field label="Drop address" for="dp-addr">
				<Input
					id="dp-addr"
					class=""
					bind:value={dispatch.address}
					placeholder="Street, building, landmark"
				/>
			</Field>
		</div>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (dispatchOpen = false)}>Cancel</Button>
		<Button loading={dispatching} disabled={!dispatch.orderId} onclick={confirmDispatch}
			>Put it on the board</Button
		>
	{/snippet}
</Modal>

<!-- ── add a rider ──────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={riderOpen}
	onOpenChange={(value) => {
		if (!value) riderOpen = false;
	}}
	title="Add a rider"
	sub="They can be assigned the moment they are saved"
	width={480}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="Name" for="rd-name" required class="sm:col-span-2">
			<Input id="rd-name" class="" bind:value={riderForm.name} placeholder="Bilal Ahmed" />
		</Field>
		<Field label="Phone" for="rd-phone">
			<Input id="rd-phone" class=" u-num" bind:value={riderForm.phone} placeholder="0300 0000000" />
		</Field>
		<Field label="Vehicle" for="rd-vehicle">
			<Input id="rd-vehicle" class="" bind:value={riderForm.vehicle} placeholder="Bike" />
		</Field>
		<Field
			label="Commission"
			hint="Their share of the delivery fee on every completed run."
			for="rd-rate"
			class="sm:col-span-2"
		>
			<div class="field-shell">
				<Input id="rd-rate" class=" u-num" bind:value={riderForm.percent} inputmode="decimal" />
				<span class="text-ink-3 pr-3 text-[12px]">%</span>
			</div>
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (riderOpen = false)}>Cancel</Button>
		<Button loading={savingRider} disabled={!riderForm.name.trim()} onclick={saveRider}
			>Add rider</Button
		>
	{/snippet}
</Modal>

<!-- ── new zone ─────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={zoneOpen}
	onOpenChange={(value) => {
		if (!value) zoneOpen = false;
	}}
	title="New delivery zone"
	sub="An area, what it costs, and when it is worth sending"
	width={480}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="Name" for="zn-name" required class="sm:col-span-2">
			<Input id="zn-name" class="" bind:value={zoneForm.name} placeholder="DHA Phase 5" />
		</Field>
		<Field label="Branch" for="zn-branch" required class="sm:col-span-2">
			<SelectField
				id="zn-branch"
				class=""
				bind:value={zoneForm.branchId}
				items={[
					...(branches.data?.items ?? [])
						.map((branch) => [{ value: branch.id, label: `${branch.name}` }])
						.flat()
				]}
			/>
		</Field>
		<Field label="Delivery fee" for="zn-fee">
			<div class="field-shell">
				<Input id="zn-fee" class=" u-num" bind:value={zoneForm.fee} inputmode="decimal" />
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>
		<Field label="Minimum order" for="zn-min">
			<div class="field-shell">
				<Input id="zn-min" class=" u-num" bind:value={zoneForm.minOrder} inputmode="decimal" />
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (zoneOpen = false)}>Cancel</Button>
		<Button
			loading={savingZone}
			disabled={!zoneForm.name.trim() || !zoneForm.branchId}
			onclick={saveZone}
		>
			Add zone
		</Button>
	{/snippet}
</Modal>

<!-- ── settle a rider ───────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={Boolean(settleFor)}
	onOpenChange={(value) => {
		if (!value) settleFor = null;
	}}
	title="Settle {riderName(settleFor)}"
	sub="Commission on every run delivered inside the window"
	width={460}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="From" for="st-from">
			<Input id="st-from" type="date" class="" bind:value={period.from} />
		</Field>
		<Field label="To" for="st-to">
			<Input id="st-to" type="date" class="" bind:value={period.to} />
		</Field>
	</div>

	{#if settled}
		<div class="perf-rule my-4"></div>
		<div class="flex items-baseline justify-between gap-3">
			<div>
				<p class="u-label">Settlement recorded</p>
				<p class="text-ink-3 mt-1 text-xs">
					{formatNumber(settled.orderCount)} run{settled.orderCount === 1 ? '' : 's'} in the window
				</p>
			</div>
			<p class="u-figure text-ink">{formatMoney(settled.amount)}</p>
		</div>
	{:else}
		<p class="text-ink-3 mt-4 text-xs">
			Settling records what is owed for the window. Only runs already marked delivered count — a bag
			still on the road is not paid until it lands.
		</p>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (settleFor = null)}>Close</Button>
		<Button loading={settling} onclick={confirmSettle}
			>{settled ? 'Settle again' : 'Settle this period'}</Button
		>
	{/snippet}
</Modal>

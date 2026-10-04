<script lang="ts">
	import { onMount } from 'svelte';
	import { format, subDays } from 'date-fns';
	import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { api } from '#lib/api';
	import { authenticated, branchId, currentUser } from '#lib/session';
	import { nowDate, litKeys, isLit } from '#lib/live';
	import { onRealtime } from '#lib/realtime';
	import { statusStyle } from '#lib/status';
	import {
		ageInMinutes,
		ageLevel,
		formatMoney,
		formatNumber,
		formatRelative,
		todayISO
	} from '#lib/format';
	import Figure from '#lib/ui/figure.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import PageHead from '#lib/ui/page-head.svelte';
	import Button from '#lib/ui/button.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import PackageX from '@lucide/svelte/icons/package-x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import BanknoteX from '@lucide/svelte/icons/banknote-x';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	const queryClient = useQueryClient();

	// Today's window, in local time — the books close on the business day, not UTC.
	const from = $derived(new Date(`${todayISO()}T00:00:00`).toISOString());
	const to = $derived(new Date(`${todayISO()}T23:59:59.999`).toISOString());

	const summary = createQuery(() => ({
		queryKey: ['reports', 'sales-summary', $branchId, from],
		queryFn: () => api.salesSummary({ from, to }),
		enabled: $authenticated
	}));

	let trendMetric = $state<'sales' | 'orders'>('sales');
	const days = $derived(
		Array.from({ length: 7 }, (_, index) => format(subDays($nowDate, 6 - index), 'yyyy-MM-dd'))
	);
	const series = createQuery(() => ({
		queryKey: ['reports', 'sales-series', $branchId, days[0]],
		queryFn: () =>
			api.salesSeries({
				from: new Date(`${days[0]}T00:00:00`).toISOString(),
				to,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
			}),
		enabled: $authenticated,
		staleTime: 60_000
	}));
	const chartRows = $derived(
		days.map((date) => ({
			date,
			label: format(new Date(`${date}T12:00:00`), 'EEE'),
			sales: Number(series.data?.find((row) => row.date === date)?.sales ?? 0),
			orders: Number(series.data?.find((row) => row.date === date)?.orderCount ?? 0)
		}))
	);
	const chartMax = $derived(Math.max(...chartRows.map((row) => row[trendMetric]), 4));
	const chartPoints = $derived(
		chartRows.map((row, index) => ({
			...row,
			x: 56 + index * 90,
			y: 210 - (row[trendMetric] / chartMax) * 160
		}))
	);
	const chartPath = $derived(
		chartPoints.map((row, index) => `${index ? 'L' : 'M'} ${row.x} ${row.y}`).join(' ')
	);
	const weekSales = $derived(chartRows.reduce((sum, row) => sum + row.sales, 0));

	const topProducts = createQuery(() => ({
		queryKey: ['reports', 'top-products', $branchId, from],
		queryFn: () => api.topProducts({ from, to }),
		enabled: $authenticated
	}));

	const liveOrders = createQuery(() => ({
		queryKey: ['orders', 'board', $branchId],
		queryFn: () => api.listOrders({ pageSize: 50 }),
		enabled: $authenticated
	}));

	const lowStock = createQuery(() => ({
		queryKey: ['inventory', 'stock', 'low', $branchId],
		queryFn: () => api.listStock({ lowOnly: true, pageSize: 6 }),
		enabled: $authenticated
	}));

	const kitchen = createQuery(() => ({
		queryKey: ['kitchen', 'tickets', $branchId],
		queryFn: () => api.listKitchenTickets({ branchId: $branchId ?? undefined }),
		enabled: $authenticated
	}));

	const missed = createQuery(() => ({
		queryKey: ['payments', 'failed', $branchId],
		queryFn: () => api.listPayments({ pageSize: 20 }),
		enabled: $authenticated
	}));

	// Realtime: any order/kitchen/payment event makes this page's numbers stale.
	onMount(() => {
		const dispose = onRealtime(() => {
			queryClient.invalidateQueries({ queryKey: ['orders'] });
			queryClient.invalidateQueries({ queryKey: ['kitchen'] });
			queryClient.invalidateQueries({ queryKey: ['reports'] });
			queryClient.invalidateQueries({ queryKey: ['inventory'] });
		});
		return dispose;
	});

	const num = (value: unknown): number => Number(value ?? 0);

	const takings = $derived(num(summary.data?.netSales));
	const orderCount = $derived(num(summary.data?.orderCount));
	const avgOrder = $derived(num(summary.data?.averageOrderValue));
	const taxTotal = $derived(num(summary.data?.tax));
	const discountTotal = $derived(num(summary.data?.discounts));

	/** Open tickets, newest first — the board's spine. */
	const openOrders = $derived(
		(liveOrders.data?.items ?? []).filter(
			(order) => order.status !== 'COMPLETED' && order.status !== 'CANCELLED'
		)
	);

	const readyTickets = $derived(
		(kitchen.data ?? []).filter((view) => view.ticket.status === 'READY').length
	);

	const failedPayments = $derived(
		(missed.data?.items ?? []).filter((payment) => payment.status === 'FAILED')
	);

	/** The sparkline is drawn from the top-products revenue shape — real rows,
	 *  not a fabricated series. Never a chart with invented data. */
	const sparkData = $derived((topProducts.data ?? []).slice(0, 16).map((row) => num(row.revenue)));

	const topRevenue = $derived(Math.max(...sparkData, 0));

	const busy = $derived(
		summary.isPending ||
			liveOrders.isPending ||
			topProducts.isPending ||
			kitchen.isPending ||
			lowStock.isPending ||
			missed.isPending
	);

	/** One row of the "needs attention" ledger: a thing that is wrong, and what
	 *  it costs if ignored. Traffic-light ordering by severity. */
	type Attention = {
		id: string;
		tone: 'brick' | 'amber' | 'slate';
		icon: typeof TriangleAlert;
		title: string;
		detail: string;
		href: string;
		action: string;
	};

	const attention = $derived.by((): Attention[] => {
		const rows: Attention[] = [];

		for (const payment of failedPayments.slice(0, 3)) {
			rows.push({
				id: `pay-${payment.id}`,
				tone: 'brick',
				icon: BanknoteX,
				title: `Payment of ${formatMoney(payment.amount)} did not capture`,
				detail: `${payment.method} · ${formatRelative(payment.createdAt)} · order balance is open`,
				href: '/orders',
				action: 'Resolve'
			});
		}

		const late = openOrders.filter(
			(order) => ageInMinutes(order.createdAt) >= 25 && order.status !== 'READY'
		);
		for (const order of late.slice(0, 3)) {
			const level = ageLevel(ageInMinutes(order.createdAt));
			rows.push({
				id: `late-${order.id}`,
				tone: level === 'overdue' ? 'brick' : 'amber',
				icon: TriangleAlert,
				title: `Ticket ${order.number} has been open ${ageInMinutes(order.createdAt)}m`,
				detail: `${statusStyle('order', order.status).label} · ${formatMoney(order.totals.grandTotal)}`,
				href: '/kitchen',
				action: 'Open pass'
			});
		}

		for (const level of (lowStock.data?.items ?? []).slice(0, 3)) {
			rows.push({
				id: `stock-${level.id}`,
				tone: level.quantity <= 0 ? 'brick' : 'amber',
				icon: PackageX,
				title:
					level.quantity <= 0
						? `${level.productName} has run out`
						: `Only ${level.quantity} × ${level.productName} left`,
				detail: `The reorder point is ${level.reorderPoint} — order before the dinner rush`,
				href: '/inventory',
				action: 'Restock'
			});
		}

		return rows.slice(0, 6);
	});

	const severityRank = { brick: 0, amber: 1, slate: 2 } as const;
	const ranked = $derived(
		[...attention].sort((a, b) => severityRank[a.tone] - severityRank[b.tone])
	);
</script>

<svelte:head><title>Dashboard — ROMS</title></svelte:head>

<PageHead
	title={$currentUser?.fullName
		? `Good ${$nowDate.getHours() < 12 ? 'morning' : $nowDate.getHours() < 17 ? 'afternoon' : 'evening'}, ${$currentUser.fullName.split(' ')[0]}`
		: 'Dashboard'}
	sub="Here’s what’s happening in your restaurant today."
>
	{#snippet actions()}
		<Button variant="outline" size="sm" onclick={() => queryClient.invalidateQueries()}>
			<RefreshCw size={14} />
			Refresh
		</Button>
		<Button size="sm" href="/pos">
			Open the POS
			<ArrowUpRight size={14} />
		</Button>
	{/snippet}
</PageHead>

<!-- ── the day's takings: one figure, torn from today ──────────────────── -->
<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
	<Figure
		label="Order sales today"
		value={summary.isPending ? '—' : formatMoney(takings)}
		sub={orderCount
			? `${formatNumber(orderCount)} tickets · avg ${formatMoney(avgOrder)}`
			: 'No tickets yet today'}
	/>

	<Figure
		label="Active orders"
		value={liveOrders.isPending ? '—' : formatNumber(openOrders.length)}
		sub={readyTickets ? `${readyTickets} waiting at the pass` : 'Nothing waiting at the pass'}
	/>
	<Figure
		label="Tax collected"
		value={summary.isPending ? '—' : formatMoney(taxTotal)}
		sub={discountTotal ? `${formatMoney(discountTotal)} given in discounts` : 'No discounts today'}
	/>
	<Figure
		label="Needs attention"
		value={busy ? '—' : formatNumber(ranked.length)}
		sub={ranked.length ? 'Items that need your attention' : 'Everything is in order'}
	/>
</div>

<div class="dashboard-analysis">
	<Plate class="overflow-hidden">
		<PlateHead title="Sales overview" sub="The last seven days, for your active branch">
			{#snippet actions()}<div class="view-toggle trend-toggle">
					<button
						type="button"
						class="w-auto px-3"
						aria-pressed={trendMetric === 'sales'}
						onclick={() => (trendMetric = 'sales')}>Sales</button
					><button
						type="button"
						class="w-auto px-3"
						aria-pressed={trendMetric === 'orders'}
						onclick={() => (trendMetric = 'orders')}>Orders</button
					>
				</div>{/snippet}
		</PlateHead>
		<div class="p-5">
			<div class="mb-3 flex items-baseline gap-3">
				<span class="text-ink text-2xl font-semibold tracking-tight"
					>{series.isPending
						? '—'
						: trendMetric === 'sales'
							? formatMoney(weekSales)
							: formatNumber(chartRows.reduce((sum, row) => sum + row.orders, 0))}</span
				><span class="text-ink-3 text-xs">This week</span>
			</div>
			{#if series.isError}<div class="text-brick py-12 text-sm" role="alert">
					Sales history could not be loaded. <button
						type="button"
						class="underline"
						onclick={() => series.refetch()}>Try again</button
					>
				</div>
			{:else if series.isPending}<div class="skel h-56"></div>
			{:else}<svg
					class="sales-chart"
					viewBox="0 0 650 255"
					role="img"
					aria-label={`Daily ${trendMetric}, ${days[0]} to ${days[6]}`}
				>
					{#each [0, 0.25, 0.5, 0.75, 1] as level (level)}<line
							x1="56"
							x2="616"
							y1={210 - level * 160}
							y2={210 - level * 160}
							stroke="var(--line)"
							stroke-dasharray="4 5"
						/><text
							x="44"
							y={214 - level * 160}
							text-anchor="end"
							fill="var(--ink-3)"
							font-size="10"
							>{trendMetric === 'orders'
								? Math.round(chartMax * level)
								: chartMax * level >= 1000
									? `${((chartMax * level) / 1000).toFixed(1)}k`
									: Math.round(chartMax * level)}</text
						>{/each}
					<path d={`${chartPath} L 596 210 L 56 210 Z`} fill="var(--brass)" opacity=".06" />
					<path
						d={chartPath}
						fill="none"
						stroke="var(--brass)"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					{#each chartPoints as point (point.date)}<circle
							cx={point.x}
							cy={point.y}
							r="4"
							fill="var(--surface)"
							stroke="var(--brass)"
							stroke-width="2"
							><title
								>{point.date}: {trendMetric === 'sales'
									? formatMoney(point.sales)
									: `${point.orders} orders`}</title
							></circle
						><text x={point.x} y="242" text-anchor="middle" fill="var(--ink-3)" font-size="11"
							>{point.label}</text
						>{/each}
				</svg>
				<p class="text-ink-3 mt-1 text-xs">
					Confirmed order value, including tax. Refunds are reported separately.
				</p>{/if}
		</div>
	</Plate>
	<Plate class="overflow-hidden"
		><PlateHead title="Popular dishes" sub="Your best sellers today" />
		{#if topProducts.isPending}<Skeleton rows={5} />{:else if !topProducts.data?.length}<Empty
				icon={ChartNoAxesColumn}
				title="No sales recorded today"
				body="Completed orders will build your menu’s performance picture."
			/>{:else}<ol class="divide-line divide-y px-5">
				{#each topProducts.data.slice(0, 5) as product, index (product.productId ?? product.name)}<li
						class="py-4"
					>
						<div class="mb-2 flex items-center justify-between gap-3">
							<div class="flex min-w-0 items-center gap-3">
								<span class="text-ink-3 text-xs">{index + 1}</span><span
									class="text-ink truncate text-sm font-medium">{product.name}</span
								>
							</div>
							<span class="text-ink shrink-0 text-sm font-medium"
								>{formatMoney(product.revenue)}</span
							>
						</div>
						<div class="flex items-center gap-3 pl-5">
							<div class="bg-surface-3 h-1.5 flex-1 overflow-hidden rounded-full">
								<div
									class="bg-brass h-full rounded-full"
									style={`width:${topRevenue ? (num(product.revenue) / topRevenue) * 100 : 0}%`}
								></div>
							</div>
							<span class="text-ink-3 text-xs">{product.quantitySold} sold</span>
						</div>
					</li>{/each}
			</ol>{/if}
	</Plate>
</div>

<div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
	<!-- ── the live board: tickets that rerank in place ────────────────── -->
	<Plate class="overflow-hidden">
		<PlateHead title="Open orders" sub="Open tickets across the floor, oldest at the top">
			{#snippet actions()}
				<Button variant="ghost" size="sm" href="/orders">
					All orders
					<ChevronRight size={14} />
				</Button>
			{/snippet}
		</PlateHead>

		{#if liveOrders.isPending}
			<Skeleton rows={6} />
		{:else if openOrders.length === 0}
			<Empty
				icon={ReceiptText}
				title="No open tickets"
				body="As soon as a ticket is rung up — at the counter, on the floor or online — it lands here and at the pass."
			>
				{#snippet action()}
					<Button size="sm" href="/pos">Start a ticket</Button>
				{/snippet}
			</Empty>
		{:else}
			<div class="max-h-[520px] overflow-y-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>Ticket</th>
							<th>Type</th>
							<th>State</th>
							<th>Age</th>
							<th class="tbl-num">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each openOrders as order (order.id)}
							{@const age = ageInMinutes(order.createdAt)}
							{@const level = ageLevel(age)}
							{@const state = statusStyle('order', order.status)}
							<tr class={isLit($litKeys, `order:${order.id}`) ? 'row-lit' : ''}>
								<td>
									<div class="flex items-center gap-2.5">
										<div class="min-w-0">
											<a
												href={`/orders/${order.id}`}
												class="text-ink text-sm font-semibold underline-offset-4 hover:underline"
												>{order.number}</a
											>
											<p class="text-ink-3 truncate text-xs">
												{order.items.length} item{order.items.length === 1 ? '' : 's'}
											</p>
										</div>
									</div>
								</td>
								<td class="text-ink-2 text-sm">{order.type.replace('_', ' ').toLowerCase()}</td>
								<td><Stamp tone={state.tone}>{state.label}</Stamp></td>
								<td>
									<span
										class="u-num text-sm {level === 'overdue'
											? 'text-brick font-[620]'
											: level === 'late'
												? 'text-amber font-[560]'
												: 'text-ink-2'}"
									>
										{age}m
									</span>
								</td>
								<td class="tbl-num u-num text-ink text-sm font-[560]">
									{formatMoney(order.totals.grandTotal)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Plate>

	<!-- ── what needs attention: a ledger, not a card grid ─────────────── -->
	<Plate class="overflow-hidden">
		<PlateHead title="Needs attention" sub="Orders that need a status update" />
		{#if busy}
			<Skeleton rows={5} />
		{:else if ranked.length === 0}
			<Empty
				icon={TriangleAlert}
				title="Nothing outstanding"
				body="Late tickets, failed captures and stock below its reorder point all surface here the moment they happen."
			/>
		{:else}
			<ul class="divide-line divide-y">
				{#each ranked as row (row.id)}
					<li>
						<a
							href={row.href}
							class="group hover:bg-surface-2 flex items-start gap-3 px-4 py-3 transition-colors"
						>
							<span
								class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-sm"
								style="background: var(--{row.tone}-wash); color: var(--{row.tone})"
							>
								<row.icon size={15} strokeWidth={1.8} />
							</span>
							<span class="min-w-0 flex-1">
								<span class="text-ink block text-sm font-[560]">{row.title}</span>
								<span class="text-ink-3 mt-0.5 block text-xs">{row.detail}</span>
							</span>
							<span
								class="text-brass-ink mt-0.5 shrink-0 text-xs font-[600] opacity-0 transition-opacity group-hover:opacity-100"
							>
								{row.action} →
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>
</div>

<p class="text-ink-3 mt-5 text-xs">
	Today’s figures update as orders move. {$branchId
		? 'Showing your active branch.'
		: 'Showing every branch.'}
</p>

<style>
	.dashboard-analysis {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
		margin-top: 20px;
	}
	.sales-chart {
		display: block;
		width: 100%;
		height: auto;
		min-height: 160px;
	}
	.trend-toggle button {
		width: auto;
		padding: 0 12px;
		font-size: 12px;
	}
	@media (min-width: 1200px) {
		.dashboard-analysis {
			grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
		}
	}
</style>

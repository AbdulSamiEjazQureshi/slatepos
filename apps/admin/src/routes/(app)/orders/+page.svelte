<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Dropdown from '#lib/components/ui/dropdown-menu/index.js';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import { nowDate, litKeys, isLit } from '#lib/live';
	import { onRealtime } from '#lib/realtime';
	import { ORDER_NEXT, ORDER_CANCELLABLE, ORDER_TYPE_LABEL, statusStyle } from '#lib/status';
	import { ageInMinutes, formatMoney, formatNumber, formatTime, todayISO } from '#lib/format';
	import type { OrderStatus } from '@roms/contracts/enums';
	import PageHead from '#lib/ui/page-head.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import Button from '#lib/ui/button.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Modal from '#lib/ui/modal.svelte';
	import Field from '#lib/ui/field.svelte';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Search from '@lucide/svelte/icons/search';
	import Ban from '@lucide/svelte/icons/ban';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

	const queryClient = useQueryClient();

	let status = $state<OrderStatus | 'ALL'>('ALL');
	let query = $state('');
	let cancelFor = $state<string | null>(null);
	let cancelReason = $state('');
	let cancelling = $state(false);
	let page = $state(1);

	const orders = createQuery(() => ({
		queryKey: ['orders', 'list', $branchId, status, page],
		queryFn: () =>
			api.listOrders({
				...(status === 'ALL' ? {} : { status }),
				page,
				pageSize: 25
			}),
		enabled: $authenticated
	}));

	onMount(() => {
		const dispose = onRealtime((event) => {
			if (event.type.startsWith('order.') || event.type === 'payment.status_changed') {
				queryClient.invalidateQueries({ queryKey: ['orders'] });
			}
		});
		return dispose;
	});

	const FILTERS: { value: OrderStatus | 'ALL'; label: string }[] = [
		{ value: 'ALL', label: 'All' },
		{ value: 'DRAFT', label: 'Draft' },
		{ value: 'CONFIRMED', label: 'Confirmed' },
		{ value: 'PREPARING', label: 'Preparing' },
		{ value: 'READY', label: 'Ready' },
		{ value: 'COMPLETED', label: 'Completed' },
		{ value: 'CANCELLED', label: 'Cancelled' },
		{ value: 'REFUNDED', label: 'Refunded' }
	];

	const rows = $derived.by(() => {
		const items = orders.data?.items ?? [];
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter(
			(order) =>
				order.number.toLowerCase().includes(needle) ||
				order.items.some((item) => item.name.toLowerCase().includes(needle))
		);
	});

	const meta = $derived(orders.data?.meta);

	const advance = async (orderId: string, nextStatus: string) => {
		try {
			await api.setOrderStatus(orderId, nextStatus as OrderStatus);
			await queryClient.invalidateQueries({ queryKey: ['orders'] });
			toast.success(`Moved to ${statusStyle('order', nextStatus).label}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change the ticket');
		}
	};

	const cancel = async () => {
		if (!cancelFor) return;
		cancelling = true;
		try {
			await api.setOrderStatus(cancelFor, 'CANCELLED', cancelReason || 'Cancelled at the counter');
			await queryClient.invalidateQueries({ queryKey: ['orders'] });
			toast.success('Ticket cancelled');
			cancelFor = null;
			cancelReason = '';
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not cancel the ticket');
		} finally {
			cancelling = false;
		}
	};
</script>

<svelte:head><title>Orders — ROMS</title></svelte:head>

<PageHead
	title="Orders"
	sub={meta
		? `${formatNumber(meta.total)} ticket${meta.total === 1 ? '' : 's'} on file`
		: 'Every ticket, from the counter to the kitchen and back'}
>
	{#snippet actions()}
		<Button
			variant="outline"
			size="sm"
			onclick={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
		>
			<RefreshCw size={14} />
			Refresh
		</Button>
		<Button size="sm" href="/pos">New ticket</Button>
	{/snippet}
</PageHead>

<Plate class="overflow-hidden">
	<PlateHead title="Tickets" sub={`Today is ${todayISO()} · ${formatTime($nowDate)}`}>
		{#snippet actions()}
			<div class="field-shell w-[200px] max-w-[46vw]">
				<Search />
				<Input class="" bind:value={query} placeholder="Number or dish…" />
			</div>
		{/snippet}
	</PlateHead>

	<div class="border-line flex gap-1.5 overflow-x-auto border-b px-4 py-2.5">
		{#each FILTERS as filter (filter.value)}
			<button
				type="button"
				class="chip h-7 shrink-0 px-2.5 text-xs"
				aria-pressed={status === filter.value}
				onclick={() => {
					status = filter.value;
					page = 1;
				}}
			>
				{filter.label}
			</button>
		{/each}
	</div>

	{#if orders.isPending}
		<Skeleton rows={8} />
	{:else if rows.length === 0}
		<Empty
			icon={ReceiptText}
			title={query
				? 'No ticket matches that'
				: status === 'ALL'
					? 'No tickets yet'
					: `Nothing is ${status.toLowerCase()}`}
			body={query
				? 'Try a ticket number, or part of a dish name.'
				: 'Tickets appear here the moment they are rung up, and stay for the record.'}
		>
			{#snippet action()}
				<Button size="sm" href="/pos">Open the POS</Button>
			{/snippet}
		</Empty>
	{:else}
		<div class="overflow-x-auto">
			<table class="tbl">
				<thead>
					<tr>
						<th>Ticket</th>
						<th class="hidden sm:table-cell">Type</th>
						<th>State</th>
						<th class="hidden md:table-cell">Age</th>
						<th class="hidden lg:table-cell">Lines</th>
						<th class="tbl-num">Total</th>
						<th style="width:150px"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as order (order.id)}
						{@const age = ageInMinutes(order.createdAt)}
						{@const state = statusStyle('order', order.status)}
						{@const next = ORDER_NEXT[order.status]}
						<tr class={isLit($litKeys, `order:${order.id}`) ? 'row-lit' : ''}>
							<td>
								<div class="flex items-center gap-2.5">
									<div class="min-w-0">
										<a
											class="u-mono text-ink hover:text-brass-ink text-sm font-[620]"
											href={`/orders/${order.id}`}>{order.number}</a
										>
										<p class="text-ink-3 truncate text-xs">
											{order.items[0]?.name ?? 'No lines'}{order.items.length > 1
												? ` +${order.items.length - 1}`
												: ''}
										</p>
									</div>
								</div>
							</td>
							<td class="text-ink-2 hidden text-sm sm:table-cell">
								{ORDER_TYPE_LABEL[order.type]}
							</td>
							<td><Stamp tone={state.tone}>{state.label}</Stamp></td>
							<td class="hidden md:table-cell">
								<span class="u-num text-ink-2 text-sm">{age}m</span>
							</td>
							<td class="u-num text-ink-2 hidden text-sm lg:table-cell">
								{order.items.length}
							</td>
							<td class="tbl-num u-num text-ink text-sm font-[600]">
								{formatMoney(order.totals.grandTotal)}
							</td>
							<td>
								<div class="flex items-center justify-end gap-1">
									{#if next?.[0]}
										<Button
											size="sm"
											variant="outline"
											onclick={() => advance(order.id, next[0].status)}>{next[0].label}</Button
										>
									{/if}
									<Dropdown.Root>
										<Dropdown.Trigger
											class="text-muted-foreground hover:bg-muted grid size-8 place-items-center rounded-md"
											aria-label={`Actions for ${order.number}`}
											><Ellipsis size={16} /></Dropdown.Trigger
										>
										<Dropdown.Content align="end"
											><Dropdown.Item onclick={() => goto(`/orders/${order.id}`)}
												>View order</Dropdown.Item
											>{#if ORDER_CANCELLABLE.includes(order.status)}<Dropdown.Separator
												/><Dropdown.Item
													variant="destructive"
													onclick={() => (cancelFor = order.id)}
													><Ban size={14} />Cancel order</Dropdown.Item
												>{/if}</Dropdown.Content
										>
									</Dropdown.Root>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if meta && meta.totalPages > 1}
			<div class="border-line flex items-center justify-between border-t px-4 py-2.5">
				<p class="u-num text-ink-3 text-xs">
					Page {meta.page} of {meta.totalPages} · {formatNumber(meta.total)} total
				</p>
				<div class="flex gap-1.5">
					<Button
						variant="outline"
						size="sm"
						disabled={!meta.hasPrevious}
						onclick={() => (page -= 1)}
					>
						Previous
					</Button>
					<Button variant="outline" size="sm" disabled={!meta.hasNext} onclick={() => (page += 1)}>
						Next
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</Plate>

<Modal
	open={cancelFor !== null}
	onOpenChange={(value) => {
		if (!value) cancelFor = null;
	}}
	title="Cancel this ticket?"
	sub="The kitchen is told immediately"
	width={440}
>
	<Field label="Reason" hint="Kept on the record — the kitchen and the books both read it.">
		<Input class="" bind:value={cancelReason} placeholder="Customer changed their mind" />
	</Field>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (cancelFor = null)}>Keep it</Button>
		<Button variant="danger" loading={cancelling} onclick={cancel}>Cancel the ticket</Button>
	{/snippet}
</Modal>

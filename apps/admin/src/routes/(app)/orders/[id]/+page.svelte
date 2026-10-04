<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated } from '#lib/session';
	import { onRealtime } from '#lib/realtime';
	import { litKeys, isLit } from '#lib/live';
	import { ORDER_NEXT, ORDER_CANCELLABLE, ORDER_TYPE_LABEL, statusStyle } from '#lib/status';
	import { ageInMinutes, ageLevel, formatDateTime, formatMoney } from '#lib/format';
	import type { OrderItemStatus, OrderStatus } from '@roms/contracts/enums';
	import Button from '#lib/ui/button.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Modal from '#lib/ui/modal.svelte';
	import Field from '#lib/ui/field.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Ban from '@lucide/svelte/icons/ban';
	import Printer from '@lucide/svelte/icons/printer';

	const queryClient = useQueryClient();
	const orderId = $derived(page.params.id ?? '');

	const order = createQuery(() => ({
		queryKey: ['orders', 'detail', orderId],
		queryFn: () => api.getOrder(orderId),
		enabled: $authenticated && Boolean(orderId)
	}));

	const payments = createQuery(() => ({
		queryKey: ['payments', 'order', orderId],
		queryFn: () => api.listPayments({ pageSize: 50 }),
		enabled: $authenticated && Boolean(orderId)
	}));

	onMount(() => {
		const dispose = onRealtime((event) => {
			if (event.type.startsWith('order.')) {
				queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] });
			}
			if (event.type === 'payment.status_changed') {
				queryClient.invalidateQueries({ queryKey: ['payments'] });
			}
		});
		return dispose;
	});

	let cancelOpen = $state(false);
	let cancelReason = $state('');
	let busy = $state(false);

	const data = $derived(order.data);
	const orderState = $derived(data ? statusStyle('order', data.status) : null);
	const next = $derived(data ? ORDER_NEXT[data.status] : undefined);
	const age = $derived(data ? ageInMinutes(data.createdAt) : 0);
	const level = $derived(ageLevel(age));

	/** The ticket's own history, in the order it happened. */
	const record = $derived.by(() => {
		if (!data) return [] as { at: string; what: string }[];
		return [
			data.createdAt ? { at: data.createdAt, what: 'Ticket opened' } : null,
			data.confirmedAt ? { at: data.confirmedAt, what: 'Confirmed at the counter' } : null,
			data.completedAt ? { at: data.completedAt, what: 'Completed and settled' } : null,
			data.cancelledAt ? { at: data.cancelledAt, what: 'Cancelled' } : null
		].filter((entry): entry is { at: string; what: string } => entry !== null);
	});

	const orderPayments = $derived(
		(payments.data?.items ?? []).filter((payment) => payment.orderId === orderId)
	);
	const captured = $derived(
		orderPayments
			.filter((payment) => payment.status === 'CAPTURED')
			.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0)
	);

	const move = async (status: OrderStatus) => {
		if (!data) return;
		busy = true;
		try {
			await api.setOrderStatus(data.id, status);
			await queryClient.invalidateQueries({ queryKey: ['orders'] });
			toast.success(`Ticket is now ${statusStyle('order', status).label.toLowerCase()}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change the ticket');
		} finally {
			busy = false;
		}
	};

	const setItemStatus = async (itemId: string, status: OrderItemStatus) => {
		if (!data) return;
		try {
			await api.setOrderItemStatus(data.id, itemId, status);
			await queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not update the line');
		}
	};

	const cancelOrder = async () => {
		if (!data) return;
		busy = true;
		try {
			await api.setOrderStatus(data.id, 'CANCELLED', cancelReason || 'Cancelled at the counter');
			await queryClient.invalidateQueries({ queryKey: ['orders'] });
			toast.success('Ticket cancelled');
			cancelOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not cancel the ticket');
		} finally {
			busy = false;
		}
	};
</script>

<svelte:head><title>{data?.number ?? 'Ticket'} — ROMS</title></svelte:head>

<div class="mb-4 flex items-center gap-3">
	<a class="btn btn-ghost btn-icon btn-sm" href="/orders" aria-label="Back to orders">
		<ArrowLeft size={16} />
	</a>
	<div class="min-w-0">
		<h1 class="u-mono text-ink truncate text-[20px] font-[660] tracking-[-0.02em]">
			{data?.number ?? 'Ticket'}
		</h1>
		<p class="text-ink-3 mt-0.5 text-[12px]">
			{#if data}
				{ORDER_TYPE_LABEL[data.type]} · opened {formatDateTime(data.createdAt)} · {age}m ago
			{:else}
				Loading the ticket…
			{/if}
		</p>
	</div>
	<div class="ml-auto flex items-center gap-2">
		{#if orderState}<Stamp tone={orderState.tone}>{orderState.label}</Stamp>{/if}
		{#if next?.[0] && data}
			<Button size="sm" loading={busy} onclick={() => move(next[0].status as OrderStatus)}>
				{next[0].label}
			</Button>
		{/if}
		{#if data && ORDER_CANCELLABLE.includes(data.status)}
			<Button size="sm" variant="quiet-danger" onclick={() => (cancelOpen = true)}>
				<Ban size={14} />
				Cancel
			</Button>
		{/if}
	</div>
</div>

{#if order.isPending}
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
		<Plate><Skeleton rows={6} /></Plate>
		<Plate><Skeleton rows={5} /></Plate>
	</div>
{:else if !data}
	<Plate>
		<Empty
			icon={Printer}
			title="That ticket is not here"
			body="It may have been removed, or the link may be for another workspace."
		>
			{#snippet action()}
				<Button size="sm" href="/orders">Back to orders</Button>
			{/snippet}
		</Empty>
	</Plate>
{:else}
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
		<!-- ── the receipt itself ─────────────────────────────────────── -->
		<div
			class="ticket ticket-perf shadow-2 overflow-hidden {isLit($litKeys, `order:${data.id}`)
				? 'row-lit'
				: ''}"
		>
			<div class="px-5 pt-4 pb-3">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="u-mono text-ink text-[14px] font-[680]">{data.number}</p>
						<p class="text-ink-3 mt-0.5 text-xs">
							{formatDateTime(data.createdAt)}
							{#if data.tableId}· table {data.tableId.slice(0, 6)}{/if}
						</p>
					</div>
					<div class="text-right">
						<p class="u-label">Ticket age</p>
						<p
							class="u-num mt-0.5 text-[15px] font-[640] {level === 'overdue'
								? 'text-brick'
								: level === 'late'
									? 'text-amber'
									: 'text-ink'}"
						>
							{age}m
						</p>
					</div>
				</div>
			</div>

			<div class="perf-rule mx-5"></div>

			<ul class="divide-line divide-y px-5">
				{#each data.items as item (item.id)}
					{@const itemState = statusStyle('item', item.status)}
					<li class="flex items-start gap-3 py-2.5">
						<span class="u-num text-ink-3 w-6 shrink-0 pt-0.5 text-[12px]">
							{item.quantity}×
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm font-[560]">{item.name}</p>
							{#if item.modifiers.length}
								<p class="text-ink-3 mt-0.5 truncate text-xs">
									{item.modifiers.map((m) => m.name).join(', ')}
								</p>
							{/if}
							{#if item.notes}
								<p class="text-amber mt-0.5 text-xs italic">“{item.notes}”</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-2.5">
							<Stamp tone={itemState.tone} dot={false}>{itemState.label}</Stamp>
							<p class="u-num text-ink w-[70px] text-right text-sm font-[560]">
								{formatMoney(item.lineTotal)}
							</p>
						</div>
					</li>
					{#if data.status !== 'COMPLETED' && data.status !== 'CANCELLED'}
						<li class="flex gap-1.5 py-1.5">
							{#each ['PENDING', 'PREPARING', 'READY', 'SERVED', 'VOID'] as option (option)}
								<button
									type="button"
									class="chip h-6 px-2 text-xs"
									aria-pressed={item.status === option}
									onclick={() => setItemStatus(item.id, option as OrderItemStatus)}
								>
									{statusStyle('item', option).label}
								</button>
							{/each}
						</li>
					{/if}
				{/each}
			</ul>

			<div class="perf-rule mx-5 mt-2"></div>

			<div class="space-y-1.5 px-5 py-3.5">
				{#each [['Subtotal', data.totals.subtotal], ['Discount', data.totals.discountTotal], ['Tax', data.totals.taxTotal], ['Service', data.totals.serviceCharge], ['Delivery', data.totals.deliveryFee], ['Tip', data.totals.tip]] as [label, amount] (label)}
					{#if Number(amount) !== 0}
						<div class="flex items-baseline justify-between text-[12px]">
							<span class="text-ink-3">{label}</span>
							<span class="u-num text-ink-2">
								{label === 'Discount' ? '−' : ''}{formatMoney(amount)}
							</span>
						</div>
					{/if}
				{/each}
				<div class="border-line mt-2 flex items-end justify-between border-t pt-2.5">
					<span class="u-label">Grand total</span>
					<span class="u-figure text-ink text-[24px]">
						{formatMoney(data.totals.grandTotal)}
					</span>
				</div>
			</div>
		</div>

		<!-- ── the money and the audit ────────────────────────────────── -->
		<div class="flex flex-col gap-4">
			<Plate>
				<PlateHead
					title="Payments"
					sub={captured
						? `${formatMoney(String(captured / 100))} captured`
						: 'Nothing captured yet'}
				/>
				{#if payments.isPending}
					<Skeleton rows={3} />
				{:else if orderPayments.length === 0}
					<Empty
						icon={Printer}
						title="No payment recorded"
						body="Capture the balance from the POS, or record a bank transfer against this ticket."
					/>
				{:else}
					<ul class="divide-line divide-y">
						{#each orderPayments as payment (payment.id)}
							{@const payState = statusStyle('payment', payment.status)}
							<li class="flex items-center justify-between gap-3 px-4 py-2.5">
								<div class="min-w-0">
									<p class="text-ink text-sm font-[540]">{payment.method}</p>
									<p class="text-ink-3 text-xs">{formatDateTime(payment.createdAt)}</p>
								</div>
								<div class="flex items-center gap-2.5">
									<Stamp tone={payState.tone}>{payState.label}</Stamp>
									<p class="u-num text-ink text-sm font-[560]">
										{formatMoney(payment.amount)}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Plate>

			<Plate>
				<PlateHead title="Record" sub="What happened, in order" />
				<ul class="px-4 py-3 text-[12px]">
					{#each record as entry (entry.what)}
						<li class="flex items-baseline gap-3 py-1">
							<span class="u-num text-ink-3 w-[92px] shrink-0 text-xs">
								{formatDateTime(entry.at)}
							</span>
							<span class="text-ink-2">{entry.what}</span>
						</li>
					{/each}
				</ul>
			</Plate>
		</div>
	</div>
{/if}

<Modal
	open={cancelOpen}
	onOpenChange={(value) => {
		if (!value) cancelOpen = false;
	}}
	title="Cancel this ticket?"
	sub="The kitchen is told immediately"
	width={440}
>
	<Field label="Reason" hint="Kept on the record — the kitchen and the books both read it.">
		<Input class="" bind:value={cancelReason} placeholder="Customer changed their mind" />
	</Field>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (cancelOpen = false)}>Keep it</Button>
		<Button variant="danger" loading={busy} onclick={cancelOrder}>Cancel the ticket</Button>
	{/snippet}
</Modal>

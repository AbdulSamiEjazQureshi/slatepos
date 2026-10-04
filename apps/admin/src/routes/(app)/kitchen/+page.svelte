<script lang="ts">
	import { onMount } from 'svelte';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import { litKeys, isLit } from '#lib/live';
	import { onRealtime } from '#lib/realtime';
	import { statusStyle } from '#lib/status';
	import { ageInMinutes, ageLevel, formatTime } from '#lib/format';
	import type { KitchenTicketStatus } from '@roms/contracts/enums';
	import PageHead from '#lib/ui/page-head.svelte';
	import Button from '#lib/ui/button.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import ConnMark from '#lib/ui/conn-mark.svelte';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import Flame from '@lucide/svelte/icons/flame';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Clock from '@lucide/svelte/icons/clock';
	import Bell from '@lucide/svelte/icons/bell';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';

	const queryClient = useQueryClient();

	let station = $state<string | null>(null);
	let board = $state<'live' | 'done'>('live');

	const stations = createQuery(() => ({
		queryKey: ['kitchen', 'stations', $branchId],
		queryFn: () => api.listStations(),
		enabled: $authenticated
	}));

	const tickets = createQuery(() => ({
		queryKey: ['kitchen', 'tickets', $branchId],
		queryFn: () => api.listKitchenTickets({ branchId: $branchId ?? undefined }),
		enabled: $authenticated,
		refetchInterval: 20_000
	}));

	onMount(() => {
		const dispose = onRealtime((event) => {
			if (event.type.startsWith('kitchen.') || event.type.startsWith('order.')) {
				queryClient.invalidateQueries({ queryKey: ['kitchen'] });
			}
		});
		return dispose;
	});

	const all = $derived(tickets.data ?? []);

	const visible = $derived.by(() => {
		const scoped = station ? all.filter((view) => view.ticket.stationId === station) : all;
		if (board === 'done') {
			return scoped.filter((view) => ['SERVED', 'VOID'].includes(view.ticket.status));
		}
		return scoped.filter((view) => !['SERVED', 'VOID'].includes(view.ticket.status));
	});

	/** The pass reads oldest-and-hottest first, the way a rail actually fills. */
	const ranked = $derived(
		[...visible].sort((a, b) => {
			const priority = b.ticket.priority - a.ticket.priority;
			if (priority !== 0) return priority;
			return new Date(a.ticket.createdAt).getTime() - new Date(b.ticket.createdAt).getTime();
		})
	);

	const counts = $derived({
		live: all.filter((view) => !['SERVED', 'VOID'].includes(view.ticket.status)).length,
		done: all.filter((view) => ['SERVED', 'VOID'].includes(view.ticket.status)).length
	});

	const move = async (ticketId: string, status: KitchenTicketStatus) => {
		try {
			await api.setKitchenTicketStatus(ticketId, status);
			await queryClient.invalidateQueries({ queryKey: ['kitchen'] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not move the ticket');
		}
	};

	const bump = async (ticketId: string, priority: number) => {
		try {
			await api.setTicketPriority(ticketId, priority);
			await queryClient.invalidateQueries({ queryKey: ['kitchen'] });
			toast.success(priority > 0 ? 'Sent to the front of the rail' : 'Priority cleared');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change priority');
		}
	};

	/** The burn bar fills exactly as the ticket ages into "overdue" — at 20
	 *  minutes it is full, which is the point at which the pass starts shouting. */
	const OVERDUE_AT = 20;
	const burn = (createdAt: string | Date): number =>
		Math.min(100, (ageInMinutes(createdAt) / OVERDUE_AT) * 100);
</script>

<svelte:head><title>Kitchen — ROMS</title></svelte:head>

<PageHead title="Kitchen" sub="Every ticket the kitchen owes the floor">
	{#snippet actions()}
		<ConnMark />
		<Button
			variant="outline"
			size="sm"
			onclick={() => queryClient.invalidateQueries({ queryKey: ['kitchen'] })}
		>
			Refresh
		</Button>
	{/snippet}
</PageHead>

<div class="mb-3 flex flex-wrap items-center gap-1.5">
	<button
		type="button"
		class="chip"
		aria-pressed={board === 'live'}
		onclick={() => (board = 'live')}
	>
		On the rail
		<span class="chip-count">{counts.live}</span>
	</button>
	<button
		type="button"
		class="chip"
		aria-pressed={board === 'done'}
		onclick={() => (board = 'done')}
	>
		Finished
		<span class="chip-count">{counts.done}</span>
	</button>

	<span class="bg-line mx-1 h-5 w-px"></span>

	<button
		type="button"
		class="chip"
		aria-pressed={station === null}
		onclick={() => (station = null)}
	>
		All stations
	</button>
	{#each stations.data ?? [] as row (row.id)}
		<button
			type="button"
			class="chip"
			aria-pressed={station === row.id}
			onclick={() => (station = row.id)}
		>
			{row.name}
			<span class="chip-count">
				{all.filter(
					(view) =>
						view.ticket.stationId === row.id && !['SERVED', 'VOID'].includes(view.ticket.status)
				).length}
			</span>
		</button>
	{/each}
</div>

{#if tickets.isPending}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
		{#each { length: 6 } as _, i (i)}
			<div class="skel h-[260px]"></div>
		{/each}
	</div>
{:else if ranked.length === 0}
	<div class="plate">
		<Empty
			icon={board === 'live' ? CookingPot : CircleCheck}
			title={board === 'live' ? 'The rail is clear' : 'Nothing finished yet'}
			body={board === 'live'
				? 'As tickets are rung up they appear here, oldest first, with the timer already running.'
				: 'Tickets land here once they have been served or voided.'}
		/>
	</div>
{:else}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
		{#each ranked as view (view.ticket.id)}
			{@const ticket = view.ticket}
			{@const age = ageInMinutes(ticket.createdAt)}
			{@const level = ageLevel(age)}
			{@const state = statusStyle('kitchen', ticket.status)}
			{@const priority = ticket.priority > 0}
			<article
				class="ticket ticket-perf shadow-2 flex flex-col overflow-hidden {isLit(
					$litKeys,
					`ticket:${ticket.id}`
				)
					? 'row-lit'
					: 'anim-rise'}"
				style="--perf-at: 58%"
			>
				<!-- the header carries the age, because that is what the pass reads -->
				<header class="flex items-start justify-between gap-2 px-4 pt-3 pb-2.5">
					<div class="min-w-0">
						<p class="u-mono text-ink text-[13.5px] font-[680]">
							{view.order.number || 'Ticket'}
						</p>
						<p class="text-ink-3 mt-0.5 truncate text-xs">
							{view.order.type.replace('_', ' ').toLowerCase()}
							{#if view.order.tableId}· table {view.order.tableId.slice(0, 6)}{/if}
							· {formatTime(ticket.createdAt)}
						</p>
					</div>
					<div class="shrink-0 text-right">
						{#if priority}
							<span class="stamp stamp-brick mb-1">Rush</span>
						{/if}
						<p
							class="u-num text-[19px] leading-none font-[680] tracking-[-0.03em] {level ===
							'overdue'
								? 'text-brick'
								: level === 'late'
									? 'text-amber'
									: 'text-ink'}"
						>
							{age}<span class="text-ink-3 text-[10px] font-[560]">m</span>
						</p>
					</div>
				</header>

				<!-- the age bar: patience burning down across the ticket -->
				<div class="bg-surface-3 mx-4 h-[3px] overflow-hidden rounded-full" aria-hidden="true">
					<div
						class="h-full rounded-full transition-[width] duration-1000 ease-linear"
						style="width: {burn(ticket.createdAt)}%; background: var(--{level === 'overdue'
							? 'brick'
							: level === 'late'
								? 'amber'
								: level === 'working'
									? 'brass'
									: 'herb'})"
					></div>
				</div>

				<div class="perf-rule mx-4 mt-2.5"></div>

				<ul class="flex-1 space-y-2 px-4 py-3">
					{#each view.items.filter((item) => item.status !== 'VOID') as item (item.id)}
						{@const itemState = statusStyle('item', item.status)}
						<li class="flex items-start gap-2.5">
							<span
								class="u-num mt-px grid h-5 w-6 shrink-0 place-items-center rounded-xs text-xs font-[660]
									{item.status === 'READY' ? 'bg-herb-wash text-herb' : 'bg-surface-3 text-ink-2'}"
							>
								{item.quantity}
							</span>
							<div class="min-w-0 flex-1">
								<p
									class="text-sm leading-snug {item.status === 'READY'
										? 'text-ink-3 decoration-herb/50 line-through'
										: 'text-ink font-[540]'}"
								>
									{item.name}
								</p>
								{#if item.notes}
									<p class="text-amber mt-0.5 text-xs font-[560]">! {item.notes}</p>
								{/if}
							</div>
							{#if itemState.label !== 'Pending'}
								<span class="text-ink-3 mt-px shrink-0 text-[9.5px] tracking-[0.08em] uppercase">
									{itemState.label}
								</span>
							{/if}
						</li>
					{/each}
					{#if ticket.notes}
						<li class="bg-amber-wash text-amber rounded-sm px-2.5 py-1.5 text-xs">
							{ticket.notes}
						</li>
					{/if}
				</ul>

				<footer class="border-line bg-surface-2 flex items-center gap-1.5 border-t p-2.5">
					<Button
						size="sm"
						variant="ghost"
						aria-label="Rush this ticket"
						title="Send to the front of the rail"
						onclick={() => bump(ticket.id, priority ? 0 : 5)}
					>
						{#if priority}<ChevronUp size={14} />{:else}<Bell size={14} />{/if}
					</Button>
					{#if ticket.status === 'NEW'}
						<Button
							size="sm"
							variant="secondary"
							class="flex-1"
							onclick={() => move(ticket.id, 'PREPARING')}
						>
							<Flame size={14} />
							Start
						</Button>
					{:else if ticket.status === 'PREPARING'}
						<Button size="sm" class="flex-1" onclick={() => move(ticket.id, 'READY')}>
							<CircleCheck size={14} />
							Ready
						</Button>
					{:else if ticket.status === 'READY'}
						<Button
							size="sm"
							variant="secondary"
							class="flex-1"
							onclick={() => move(ticket.id, 'SERVED')}
						>
							<Clock size={14} />
							Handed over
						</Button>
					{:else}
						<Stamp tone={state.tone}>{state.label}</Stamp>
					{/if}
				</footer>
			</article>
		{/each}
	</div>
{/if}

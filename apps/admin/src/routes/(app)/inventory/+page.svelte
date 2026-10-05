<script lang="ts">
	import SelectField from '#lib/ui/select-field.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { onMount } from 'svelte';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import { onRealtime } from '#lib/realtime';
	import { litKeys, isLit } from '#lib/live';
	import { formatMoney, formatNumber, formatRelative, humanizeEnum } from '#lib/format';
	import type { StockMovementType } from '@roms/contracts/enums';
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
	import Boxes from '@lucide/svelte/icons/boxes';
	import Search from '@lucide/svelte/icons/search';
	import PackageX from '@lucide/svelte/icons/package-x';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import ScrollText from '@lucide/svelte/icons/scroll-text';

	const queryClient = useQueryClient();

	let tab = $state<'levels' | 'movements'>('levels');
	let query = $state('');
	let lowOnly = $state(false);

	const stock = createQuery(() => ({
		queryKey: ['inventory', 'stock', $branchId],
		// Always the full list: the "only low" filter and the search box are both
		// applied here rather than server-side, so the transfer picker and the
		// counts keep seeing every line.
		queryFn: () => api.listStock({ pageSize: 200 }),
		enabled: $authenticated
	}));

	const movements = createQuery(() => ({
		queryKey: ['inventory', 'movements', $branchId],
		queryFn: () => api.listMovements({ pageSize: 60 }),
		enabled: $authenticated,
		refetchInterval: 60_000
	}));

	const valuation = createQuery(() => ({
		queryKey: ['reports', 'inventory-valuation'],
		queryFn: () => api.inventoryValuation(),
		enabled: $authenticated
	}));

	onMount(() => {
		const dispose = onRealtime((event) => {
			if (event.type.startsWith('inventory.') || event.type === 'order.status_changed') {
				queryClient.invalidateQueries({ queryKey: ['inventory'] });
			}
		});
		return dispose;
	});

	const rows = $derived.by(() => {
		// The route's `q` and `lowOnly` params are unreliable (q is never applied,
		// lowOnly coerces), so both filters are done here over the full list.
		let items = stock.data?.items ?? [];
		if (lowOnly) items = items.filter((row) => row.quantity <= row.reorderPoint);
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter((row) => row.productName?.toLowerCase().includes(needle));
	});

	/** Three states, not a number: plenty, watch it, gone. */
	type Level = 'out' | 'low' | 'ok';
	const levelOf = (quantity: number, reorderPoint: number): Level =>
		quantity <= 0 ? 'out' : quantity <= reorderPoint ? 'low' : 'ok';

	const counts = $derived.by(() => {
		const items = stock.data?.items ?? [];
		let out = 0;
		let low = 0;
		for (const row of items) {
			const level = levelOf(row.quantity, row.reorderPoint);
			if (level === 'out') out += 1;
			else if (level === 'low') low += 1;
		}
		return { out, low, total: items.length };
	});

	/** How full the shelf is against its reorder point — the gauge's fill. */
	const fillOf = (quantity: number, reorderPoint: number): number => {
		const target = Math.max(reorderPoint * 3, 1);
		return Math.min(100, Math.max(0, (quantity / target) * 100));
	};

	// ── adjust a level in place ───────────────────────────────────────────
	let adjustFor = $state<{ id: string; name: string; quantity: number } | null>(null);
	let adjustQty = $state(1);
	let adjustType = $state<StockMovementType>('ADJUSTMENT');
	let adjustReason = $state('');
	let adjusting = $state(false);

	const openAdjust = (row: { productId: string; productName: string; quantity: number }) => {
		adjustFor = { id: row.productId, name: row.productName, quantity: row.quantity };
		adjustQty = 1;
		adjustType = 'ADJUSTMENT';
		adjustReason = '';
	};

	const adjust = async (direction: 1 | -1) => {
		if (!adjustFor) return;
		adjusting = true;
		try {
			await api.adjustStock({
				productId: adjustFor.id,
				quantityDelta: direction * Math.abs(adjustQty),
				movementType: adjustType,
				reason: adjustReason || (direction > 0 ? 'Stock received' : 'Stock written off'),
				...(($branchId as string | null) ? { branchId: $branchId } : {})
			});
			await queryClient.invalidateQueries({ queryKey: ['inventory'] });
			toast.success(direction > 0 ? 'Stock booked in' : 'Stock written off');
			adjustFor = null;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not adjust the stock');
		} finally {
			adjusting = false;
		}
	};

	const quickStep = async (row: { productId: string; productName: string }, direction: 1 | -1) => {
		try {
			await api.adjustStock({
				productId: row.productId,
				quantityDelta: direction,
				movementType: direction > 0 ? 'PURCHASE' : 'WASTAGE',
				reason: direction > 0 ? 'Quick receive' : 'Quick write-off',
				...(($branchId as string | null) ? { branchId: $branchId } : {})
			});
			await queryClient.invalidateQueries({ queryKey: ['inventory'] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change the level');
		}
	};

	// ── transfer between branches ─────────────────────────────────────────
	let transferOpen = $state(false);
	let transferFrom = $state('');
	let transferTo = $state('');
	let transferQuery = $state('');
	let transferLines = $state<{ productId: string; name: string; quantity: number }[]>([]);
	let transferring = $state(false);

	const branches = createQuery(() => ({
		queryKey: ['branches'],
		queryFn: () => api.listBranches(),
		enabled: $authenticated
	}));

	const openTransfer = () => {
		transferFrom = $branchId ?? branches.data?.items?.[0]?.id ?? '';
		transferTo = branches.data?.items?.find((b) => b.id !== transferFrom)?.id ?? '';
		transferQuery = '';
		transferLines = [];
		transferOpen = true;
	};

	const canTransfer = $derived(
		Boolean(transferFrom) &&
			Boolean(transferTo) &&
			transferFrom !== transferTo &&
			transferLines.length > 0 &&
			transferLines.every((line) => line.quantity > 0)
	);

	/** Products eligible to move — only those with stock at the source. */
	const transferable = $derived.by(() => {
		const needle = transferQuery.trim().toLowerCase();
		return (stock.data?.items ?? [])
			.filter((row) => row.quantity > 0)
			.filter((row) => !needle || row.productName?.toLowerCase().includes(needle))
			.filter((row) => !transferLines.some((line) => line.productId === row.productId))
			.slice(0, 8);
	});

	const addTransferLine = (row: { productId: string; productName: string; quantity: number }) => {
		transferLines = [
			...transferLines,
			{ productId: row.productId, name: row.productName, quantity: 1 }
		];
		transferQuery = '';
	};

	const runTransfer = async () => {
		if (!canTransfer) return;
		transferring = true;
		try {
			const result = await api.transferStock({
				fromBranchId: transferFrom,
				toBranchId: transferTo,
				items: transferLines.map((line) => ({
					productId: line.productId,
					quantity: line.quantity
				})),
				reason: 'Branch transfer'
			});
			await queryClient.invalidateQueries({ queryKey: ['inventory'] });
			toast.success(`${result.transferred} line${result.transferred === 1 ? '' : 's'} moved`);
			transferOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not move the stock');
		} finally {
			transferring = false;
		}
	};

	/** Movements carry a sign; the ledger reads it as a direction. */
	const signOf = (delta: number) => (delta > 0 ? 'in' : delta < 0 ? 'out' : 'flat');
	const MOVEMENT_TONE: Record<string, 'herb' | 'brick' | 'slate' | 'amber'> = {
		PURCHASE: 'herb',
		TRANSFER_IN: 'herb',
		PRODUCTION: 'herb',
		SALE: 'slate',
		TRANSFER_OUT: 'slate',
		ADJUSTMENT: 'amber',
		WASTAGE: 'brick',
		RETURN: 'brick',
		REVERSAL: 'brick'
	};
</script>

<svelte:head><title>Inventory — ROMS</title></svelte:head>

<PageHead
	title="Inventory"
	sub={`${formatNumber(counts.total)} lines tracked${counts.low + counts.out ? ` · ${counts.low + counts.out} need attention` : ''}`}
>
	{#snippet actions()}
		<Button
			variant="outline"
			size="sm"
			onclick={openTransfer}
			disabled={(branches.data?.items?.length ?? 0) < 2}
		>
			<ArrowLeftRight size={14} />
			Transfer
		</Button>
		<Button size="sm" href="/purchasing">
			<Plus size={14} />
			Order stock
		</Button>
	{/snippet}
</PageHead>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
	<Figure
		label="Lines tracked"
		value={stock.isPending ? '—' : formatNumber(counts.total)}
		sub="Every product with a stock level at this branch"
	/>
	<Figure
		label="Below reorder point"
		value={stock.isPending ? '—' : formatNumber(counts.low)}
		sub={counts.low ? 'Order before the next rush' : 'Nothing running low'}
		delta={counts.low ? 'watch' : undefined}
		deltaTone={counts.low ? 'brick' : 'neutral'}
	/>
	<Figure
		label="Stock at cost"
		value={valuation.isPending ? '—' : formatMoney(valuation.data?.total ?? '0')}
		sub="Across every branch, at cost price"
	/>
</div>

<Plate class="mt-4 overflow-hidden">
	<PlateHead
		title={tab === 'levels' ? 'Levels' : 'Movements'}
		sub={tab === 'levels' ? 'On hand against the reorder point' : 'Every change, newest first'}
	>
		{#snippet actions()}
			<div class="border-line flex rounded-sm border p-0.5">
				<button
					type="button"
					class="chip h-7 rounded-xs px-2.5 text-xs"
					aria-pressed={tab === 'levels'}
					onclick={() => (tab = 'levels')}
				>
					Levels
				</button>
				<button
					type="button"
					class="chip h-7 rounded-xs px-2.5 text-xs"
					aria-pressed={tab === 'movements'}
					onclick={() => (tab = 'movements')}
				>
					Movements
				</button>
			</div>
			{#if tab === 'levels'}
				<button
					type="button"
					class="chip h-7 px-2.5 text-xs"
					aria-pressed={lowOnly}
					onclick={() => (lowOnly = !lowOnly)}
				>
					<PackageX size={12} />
					Only low
				</button>
			{/if}
		{/snippet}
	</PlateHead>

	{#if tab === 'levels'}
		<div class="border-line border-b px-4 py-2.5">
			<div class="field-shell w-full max-w-[280px]">
				<Search />
				<Input aria-label="Search" class="" bind:value={query} placeholder="Find a product…" />
			</div>
		</div>

		{#if stock.isPending}
			<Skeleton rows={8} />
		{:else if rows.length === 0}
			<Empty
				icon={lowOnly ? PackageX : Boxes}
				title={query
					? 'No product matches that'
					: lowOnly
						? 'Nothing is running low'
						: 'No stock tracked yet'}
				body={query
					? 'Try a different name.'
					: lowOnly
						? 'Every line is comfortably above its reorder point.'
						: 'Turn on stock tracking on a product, then receive it here or through a purchase order.'}
			/>
		{:else}
			<ul class="divide-line divide-y">
				{#each rows as row (row.id)}
					{@const level = levelOf(row.quantity, row.reorderPoint)}
					{@const tone = level === 'out' ? 'brick' : level === 'low' ? 'amber' : 'herb'}
					<li
						class="group hover:bg-surface-2 flex items-center gap-3 px-4 py-2.5 transition-colors
							{isLit($litKeys, `stock:${row.productId}`) ? 'row-lit' : ''}"
					>
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm font-[560]">{row.productName}</p>
							<p class="text-ink-3 mt-0.5 text-xs">
								Reorder at <span class="u-num">{row.reorderPoint}</span>
								{#if level === 'out'}
									· <span class="text-brick">none left</span>
								{:else if level === 'low'}
									· <span class="text-amber">order soon</span>
								{/if}
							</p>
						</div>

						<!-- the gauge: how full the shelf is. The hairline sits at the
						     reorder point — a third of the way across, since the gauge's
						     full width is three reorder points. -->
						<div class="hidden w-[120px] shrink-0 sm:block" aria-hidden="true">
							<div class="bg-surface-3 relative h-1.5 overflow-hidden rounded-full">
								<div
									class="h-full rounded-full transition-[width] duration-500"
									style="width: {fillOf(
										row.quantity,
										row.reorderPoint
									)}%; background: var(--{tone})"
								></div>
								<span class="bg-line-strong absolute top-[-2px] h-[10px] w-px" style="left: 33.4%"
								></span>
							</div>
						</div>

						<p
							class="u-num w-[68px] shrink-0 text-right text-[15px] font-[640] tracking-[-0.02em]
								{level === 'out' ? 'text-brick' : level === 'low' ? 'text-amber' : 'text-ink'}"
						>
							{formatNumber(row.quantity)}
						</p>

						<div
							class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
						>
							<button
								type="button"
								class="btn btn-ghost btn-icon btn-sm"
								aria-label="Write off one {row.productName}"
								onclick={() => quickStep(row, -1)}
							>
								<Minus size={14} />
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-icon btn-sm"
								aria-label="Receive one {row.productName}"
								onclick={() => quickStep(row, 1)}
							>
								<Plus size={14} />
							</button>
							<Button size="sm" variant="outline" onclick={() => openAdjust(row)}>Adjust</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if movements.isPending}
		<Skeleton rows={8} />
	{:else if (movements.data?.items ?? []).length === 0}
		<Empty
			icon={ScrollText}
			title="No movement yet"
			body="Every sale, delivery, write-off and transfer is written here as it happens, with the balance it left behind."
		/>
	{:else}
		<div class="overflow-x-auto">
			<table class="tbl">
				<thead>
					<tr>
						<th>When</th>
						<th>Product</th>
						<th>Reason</th>
						<th class="tbl-num">Change</th>
						<th class="tbl-num">Balance</th>
					</tr>
				</thead>
				<tbody>
					{#each movements.data?.items ?? [] as row (row.id)}
						{@const direction = signOf(row.quantityDelta)}
						<tr>
							<td class="u-num text-ink-3 text-xs whitespace-nowrap">
								{formatRelative(row.createdAt)}
							</td>
							<td class="min-w-0">
								<p class="u-mono text-ink-2 text-xs">
									{row.productId.slice(0, 8)}
								</p>
							</td>
							<td>
								<div class="flex items-center gap-2">
									<Stamp tone={MOVEMENT_TONE[row.movementType] ?? 'slate'} dot={false}>
										{humanizeEnum(row.movementType)}
									</Stamp>
									<span class="text-ink-3 truncate text-xs">{row.reason}</span>
								</div>
							</td>
							<td
								class="tbl-num u-num text-sm font-[620]
									{direction === 'in' ? 'text-herb' : direction === 'out' ? 'text-brick' : 'text-ink-3'}"
							>
								{direction === 'in' ? '+' : direction === 'out' ? '−' : ''}{Math.abs(
									row.quantityDelta
								)}
							</td>
							<td class="tbl-num u-num text-ink-2 text-sm">{row.balanceAfter}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Plate>

<!-- ── adjust ───────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={adjustFor !== null}
	onOpenChange={(value) => {
		if (!value) adjustFor = null;
	}}
	title="Adjust stock"
	sub={adjustFor ? `${adjustFor.name} · ${adjustFor.quantity} on hand` : ''}
	width={460}
>
	<div class="form-stack">
		<Field label="Quantity" for="a-qty">
			<div class="field-shell">
				<Input id="a-qty" type="number" min="1" class=" u-num" bind:value={adjustQty} />
				<span class="text-ink-3 pr-3 text-[12px]">units</span>
			</div>
		</Field>

		<Field label="Adjustment reason" hint="This is what the ledger will say happened.">
			<div class="flex flex-wrap gap-1.5">
				{#each ['ADJUSTMENT', 'PURCHASE', 'WASTAGE', 'RETURN', 'PRODUCTION'] as option (option)}
					<button
						type="button"
						class="chip h-7 px-2.5 text-xs"
						aria-pressed={adjustType === option}
						onclick={() => (adjustType = option as StockMovementType)}
					>
						{humanizeEnum(option)}
					</button>
				{/each}
			</div>
		</Field>

		<Field label="Note" for="a-note">
			<Input
				id="a-note"
				class=""
				bind:value={adjustReason}
				placeholder="Counted during the evening stock take"
			/>
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (adjustFor = null)}>Cancel</Button>
		<Button variant="quiet-danger" loading={adjusting} onclick={() => adjust(-1)}>
			<Minus size={14} />
			Take out
		</Button>
		<Button loading={adjusting} onclick={() => adjust(1)}>
			<Plus size={14} />
			Put in
		</Button>
	{/snippet}
</Modal>

<!-- ── transfer ─────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={transferOpen}
	onOpenChange={(value) => {
		if (!value) transferOpen = false;
	}}
	title="Move stock between branches"
	sub="One line per product, sent in a single movement"
	width={560}
>
	<FormSection title="Transfer route" description="Select the source and destination branches.">
		<Field label="Source branch" for="t-from">
			<SelectField
				id="t-from"
				class=""
				bind:value={transferFrom}
				items={[
					...(branches.data?.items ?? [])
						.map((branch) => [{ value: branch.id, label: `${branch.name}` }])
						.flat()
				]}
			/>
		</Field>
		<Field label="Destination branch" for="t-to">
			<SelectField
				id="t-to"
				class=""
				bind:value={transferTo}
				items={[
					...(branches.data?.items ?? [])
						.map((branch) => [{ value: branch.id, label: `${branch.name}` }])
						.flat()
				]}
			/>
		</Field>
	</FormSection>

	{#if transferFrom === transferTo}
		<p class="text-amber mt-3 text-[12px]">
			Pick two different branches — stock cannot move to where it already is.
		</p>
	{:else}
		<!-- add a line -->
		<div class="mt-4">
			<label class="lbl" for="t-find">Add products</label>
			<div class="field-shell">
				<Search />
				<Input
					id="t-find"
					class=""
					bind:value={transferQuery}
					placeholder="Search stock to move…"
				/>
			</div>
			{#if transferQuery.trim()}
				<ul class="border-line mt-2 max-h-[160px] overflow-y-auto rounded-sm border">
					{#each transferable as row (row.productId)}
						<li>
							<button
								type="button"
								class="hover:bg-surface-2 flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors"
								onclick={() => addTransferLine(row)}
							>
								<span class="text-ink min-w-0 truncate text-sm">{row.productName}</span>
								<span class="u-num text-ink-3 shrink-0 text-xs">
									{formatNumber(row.quantity)} on hand
								</span>
							</button>
						</li>
					{:else}
						<li class="text-ink-3 px-3 py-3 text-center text-[12px]">
							Nothing with stock matches that.
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if transferLines.length}
			<div class="perf-rule mt-4"></div>
			<ul class="mt-3 space-y-1.5">
				{#each transferLines as line, i (line.productId)}
					<li class="flex items-center gap-2.5">
						<span class="text-ink min-w-0 flex-1 truncate text-sm">{line.name}</span>
						<div class="flex items-center gap-1">
							<button
								type="button"
								class="btn btn-ghost btn-icon btn-sm"
								aria-label="One fewer {line.name}"
								onclick={() => (transferLines[i].quantity = Math.max(1, line.quantity - 1))}
							>
								<Minus size={13} />
							</button>
							<Input
								aria-label="Quantity for {line.name}"
								type="number"
								min="1"
								class=" u-num h-7 w-[64px] px-2 text-center text-sm"
								bind:value={line.quantity}
							/>
							<button
								type="button"
								class="btn btn-ghost btn-icon btn-sm"
								aria-label="One more {line.name}"
								onclick={() => (transferLines[i].quantity = line.quantity + 1)}
							>
								<Plus size={13} />
							</button>
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-icon btn-sm text-ink-3 hover:text-brick"
							aria-label="Remove {line.name}"
							onclick={() =>
								(transferLines = transferLines.filter((l) => l.productId !== line.productId))}
						>
							<Minus size={14} />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (transferOpen = false)}>Cancel</Button>
		<Button loading={transferring} disabled={!canTransfer} onclick={runTransfer}>
			Move{transferLines.length ? ` ${transferLines.length}` : ''} line{transferLines.length === 1
				? ''
				: 's'}
		</Button>
	{/snippet}
</Modal>

<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated } from '#lib/session';
	import { formatDate, formatMoney, formatNumber } from '#lib/format';
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
	import Tag from '@lucide/svelte/icons/tag';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Power from '@lucide/svelte/icons/power';

	const queryClient = useQueryClient();

	const promotions = createQuery(() => ({
		queryKey: ['promotions', 'list'],
		queryFn: () => api.listPromotions(),
		enabled: $authenticated
	}));

	const branches = createQuery(() => ({
		queryKey: ['branches'],
		queryFn: () => api.listBranches(),
		enabled: $authenticated
	}));

	const categories = createQuery(() => ({
		queryKey: ['catalog', 'categories'],
		queryFn: () => api.categories(),
		enabled: $authenticated
	}));

	const rows = $derived(promotions.data ?? []);
	const active = $derived(rows.filter((row) => row.isActive).length);

	/** A promotion is live if it is switched on and today is inside its window. */
	const isLive = (promo: {
		isActive: boolean;
		startDate: string | Date | null;
		endDate: string | Date | null;
	}) => {
		if (!promo.isActive) return false;
		const now = Date.now();
		if (promo.startDate && new Date(promo.startDate).getTime() > now) return false;
		if (promo.endDate && new Date(promo.endDate).getTime() < now) return false;
		return true;
	};

	const live = $derived(rows.filter(isLive).length);

	/** Percent promos store a fraction; show the percent a person typed. */
	const asPercent = (value: string) =>
		`${(Number(value) * 100).toFixed((Number(value) * 100) % 1 === 0 ? 0 : 2)}%`;

	const describeValue = (promo: { type: string; value: string }) =>
		promo.type === 'PERCENT'
			? asPercent(promo.value)
			: promo.type === 'FIXED'
				? formatMoney(promo.value)
				: 'Buy one, get one';

	const isScheduled = (promo: { startDate: string | Date | null }) =>
		Boolean(promo.startDate) && new Date(promo.startDate as string).getTime() > Date.now();
	const isExpired = (promo: { endDate: string | Date | null }) =>
		Boolean(promo.endDate) && new Date(promo.endDate as string).getTime() < Date.now();

	// ── create / edit ─────────────────────────────────────────────────────
	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let form = $state({
		name: '',
		type: 'PERCENT' as 'PERCENT' | 'FIXED' | 'BOGO',
		percent: '',
		amount: '0',
		code: '',
		minOrder: '0',
		maxDiscount: '',
		usageLimit: '',
		startDate: '',
		endDate: '',
		branchIds: [] as string[],
		categoryIds: [] as string[]
	});

	const openCreate = () => {
		editingId = null;
		form = {
			name: '',
			type: 'PERCENT',
			percent: '',
			amount: '0',
			code: '',
			minOrder: '0',
			maxDiscount: '',
			usageLimit: '',
			startDate: '',
			endDate: '',
			branchIds: [],
			categoryIds: []
		};
		formOpen = true;
	};

	const openEdit = (promo: (typeof rows)[number]) => {
		editingId = promo.id;
		form = {
			name: promo.name,
			type: promo.type,
			percent: promo.type === 'PERCENT' ? String(Number(promo.value) * 100) : '',
			amount: promo.type === 'FIXED' ? promo.value : '0',
			code: promo.code ?? '',
			minOrder: promo.minOrder,
			maxDiscount: promo.maxDiscount ?? '',
			usageLimit: promo.usageLimit ? String(promo.usageLimit) : '',
			startDate: promo.startDate ? String(promo.startDate).slice(0, 10) : '',
			endDate: promo.endDate ? String(promo.endDate).slice(0, 10) : '',
			branchIds: [...promo.branchIds],
			categoryIds: [...promo.categoryIds]
		};
		formOpen = true;
	};

	const toggle = (list: string[], value: string): string[] =>
		list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

	const save = async () => {
		if (!form.name.trim()) return;
		saving = true;
		try {
			const body = {
				name: form.name.trim(),
				type: form.type,
				// A percent typed as "10" means ten per cent; the API wants "0.10".
				value:
					form.type === 'PERCENT' ? String((Number(form.percent) || 0) / 100) : form.amount || '0',
				minOrder: form.minOrder || '0',
				branchIds: form.branchIds,
				categoryIds: form.categoryIds,
				// The promotion API takes full offset datetimes, not bare dates.
				...(form.startDate ? { startDate: `${form.startDate}T00:00:00.000Z` } : {}),
				...(form.endDate ? { endDate: `${form.endDate}T23:59:59.000Z` } : {})
			};
			if (editingId) {
				// A PATCH with explicit nulls: send the cleared fields as null so
				// they are emptied, and the rest as values so nothing is reset.
				await api.updatePromotion(editingId, {
					...body,
					code: form.code.trim() || null,
					maxDiscount: form.maxDiscount || null,
					usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
					customerGroup: null,
					startDate: body.startDate ?? null,
					endDate: body.endDate ?? null
				});
				toast.success(`${body.name} updated`);
			} else {
				await api.createPromotion({
					...body,
					...(form.code.trim() ? { code: form.code.trim().toUpperCase() } : {}),
					...(form.maxDiscount ? { maxDiscount: form.maxDiscount } : {}),
					...(form.usageLimit ? { usageLimit: Number(form.usageLimit) } : {})
				});
				toast.success(`${body.name} is live`);
			}
			await queryClient.invalidateQueries({ queryKey: ['promotions'] });
			formOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save the promotion');
		} finally {
			saving = false;
		}
	};

	const setActive = async (id: string, isActive: boolean, name: string) => {
		try {
			await api.updatePromotion(id, { isActive });
			await queryClient.invalidateQueries({ queryKey: ['promotions'] });
			toast.success(`${name} ${isActive ? 'switched on' : 'switched off'}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not switch it');
		}
	};

	const categoryName = (id: string) =>
		categories.data?.items.find((row) => row.id === id)?.name ?? 'Category';
</script>

<svelte:head><title>Promotions — ROMS</title></svelte:head>

<PageHead title="Promotions" sub="Manage offers, eligibility and schedules.">
	{#snippet actions()}
		<Button size="sm" onclick={openCreate}>
			<Plus size={14} />
			New promotion
		</Button>
	{/snippet}
</PageHead>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
	<Figure
		label="Live now"
		value={promotions.isPending ? '—' : formatNumber(live)}
		sub="Switched on and inside their window"
	/>
	<Figure
		label="Switched on"
		value={promotions.isPending ? '—' : formatNumber(active)}
		sub="Including scheduled and expired"
	/>
	<Figure
		label="Total"
		value={promotions.isPending ? '—' : formatNumber(rows.length)}
		sub="Every offer on the books"
	/>
</div>

<Plate class="mt-4 overflow-hidden">
	<PlateHead title="Offers" sub="Switch one off to stop it applying at the till" />

	{#if promotions.isPending}
		<Skeleton rows={6} />
	{:else if rows.length === 0}
		<Empty
			icon={Tag}
			title="No promotions yet"
			body="Set a percentage or a fixed amount off, gate it behind a code, and cap it so a big ticket cannot run away with it."
		>
			{#snippet action()}
				<Button size="sm" onclick={openCreate}>Create a promotion</Button>
			{/snippet}
		</Empty>
	{:else}
		<ul class="divide-line divide-y">
			{#each rows as promo (promo.id)}
				<li class="px-4 py-3">
					<div class="flex items-start gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-ink text-sm font-[560]">{promo.name}</p>
								<Stamp
									tone={isLive(promo)
										? 'herb'
										: isScheduled(promo)
											? 'slate'
											: isExpired(promo)
												? 'brick'
												: 'neutral'}
								>
									{isLive(promo)
										? 'Live'
										: isScheduled(promo)
											? 'Scheduled'
											: isExpired(promo)
												? 'Expired'
												: 'Off'}
								</Stamp>
								{#if promo.code}
									<span
										class="chip u-mono border-brass-line bg-brass-wash text-brass-ink h-6 cursor-default px-2 text-xs"
									>
										{promo.code}
									</span>
								{/if}
							</div>

							<div class="text-ink-3 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
								<span class="text-ink-2 font-[600]">{describeValue(promo)} off</span>
								{#if Number(promo.minOrder) > 0}
									<span>min {formatMoney(promo.minOrder)}</span>
								{/if}
								{#if promo.maxDiscount}
									<span>capped at {formatMoney(promo.maxDiscount)}</span>
								{/if}
								{#if promo.usageLimit}
									<span class="u-num">{promo.usedCount} / {promo.usageLimit} used</span>
								{/if}
								{#if promo.branchIds.length}
									<span
										>{promo.branchIds.length} branch{promo.branchIds.length === 1 ? '' : 'es'}</span
									>
								{:else}
									<span>every branch</span>
								{/if}
								{#if promo.categoryIds.length}
									<span>{promo.categoryIds.map(categoryName).slice(0, 2).join(', ')}</span>
								{/if}
							</div>

							{#if promo.startDate || promo.endDate}
								<p class="text-ink-3 mt-1 text-xs">
									{#if promo.startDate}from {formatDate(promo.startDate)}{/if}
									{#if promo.endDate}
										· until {formatDate(promo.endDate)}{/if}
								</p>
							{/if}
						</div>

						<div class="flex shrink-0 items-center gap-1">
							<Button
								size="icon"
								variant="ghost"
								class="btn-sm"
								aria-label="Edit {promo.name}"
								onclick={() => openEdit(promo)}
							>
								<Pencil size={14} />
							</Button>
							<Button
								size="icon"
								variant="ghost"
								class="btn-sm {promo.isActive ? 'text-herb' : 'text-ink-3'}"
								aria-label={promo.isActive ? `Switch off ${promo.name}` : `Switch on ${promo.name}`}
								onclick={() => setActive(promo.id, !promo.isActive, promo.name)}
							>
								<Power size={14} />
							</Button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</Plate>

<!-- ── create / edit ────────────────────────────────────────────────────── -->
<Modal
	open={formOpen}
	onOpenChange={(value) => {
		if (!value) formOpen = false;
	}}
	title={editingId ? 'Edit promotion' : 'New promotion'}
	sub={editingId
		? 'Only what you change here moves'
		: 'It applies at the till as soon as it is live'}
	width={640}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="Name" for="pr-name" required class="sm:col-span-2">
			<Input id="pr-name" class="" bind:value={form.name} placeholder="Weekend brunch" />
		</Field>

		<Field label="Kind" for="pr-type">
			<div class="border-line flex rounded-sm border p-0.5">
				{#each ['PERCENT', 'FIXED', 'BOGO'] as option (option)}
					<button
						type="button"
						class="chip h-7 flex-1 justify-center rounded-xs text-xs"
						aria-pressed={form.type === option}
						onclick={() => (form.type = option as typeof form.type)}
					>
						{option === 'PERCENT' ? 'Percent' : option === 'FIXED' ? 'Fixed' : 'BOGO'}
					</button>
				{/each}
			</div>
		</Field>

		{#if form.type === 'PERCENT'}
			<Field label="Percent off" for="pr-pct" required>
				<div class="field-shell">
					<Input
						id="pr-pct"
						class=" u-num"
						bind:value={form.percent}
						inputmode="decimal"
						placeholder="10"
					/>
					<span class="text-ink-3 pr-3 text-[12px]">%</span>
				</div>
			</Field>
		{:else if form.type === 'FIXED'}
			<Field label="Amount off" for="pr-amt" required>
				<div class="field-shell">
					<Input
						id="pr-amt"
						class=" u-num"
						bind:value={form.amount}
						inputmode="decimal"
						placeholder="0.00"
					/>
					<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
				</div>
			</Field>
		{:else}
			<Field label="Value" hint="BOGO is recorded but not yet applied at the till." for="pr-bogo">
				<div class="field-shell">
					<Input id="pr-bogo" class="" value="Buy one, get one" disabled />
				</div>
			</Field>
		{/if}

		<Field label="Code" hint="Leave blank for a promotion that always applies." for="pr-code">
			<Input id="pr-code" class=" u-mono uppercase" bind:value={form.code} placeholder="BRUNCH10" />
		</Field>

		<Field label="Minimum order" for="pr-min">
			<div class="field-shell">
				<Input id="pr-min" class=" u-num" bind:value={form.minOrder} inputmode="decimal" />
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>

		<Field label="Cap" hint="The most it can ever take off one order." for="pr-cap">
			<div class="field-shell">
				<Input
					id="pr-cap"
					class=" u-num"
					bind:value={form.maxDiscount}
					inputmode="decimal"
					placeholder="Unlimited"
				/>
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>

		<Field label="Usage limit" hint="Leave blank for unlimited." for="pr-uses">
			<div class="field-shell">
				<Input id="pr-uses" type="number" min="1" class=" u-num" bind:value={form.usageLimit} />
				<span class="text-ink-3 pr-3 text-[12px]">orders</span>
			</div>
		</Field>

		<Field label="Starts" for="pr-start">
			<Input id="pr-start" type="date" class="" bind:value={form.startDate} />
		</Field>
		<Field label="Ends" for="pr-end">
			<Input id="pr-end" type="date" class="" bind:value={form.endDate} />
		</Field>
	</div>

	<div class="perf-rule my-4"></div>

	<Field label="Branches" hint="None means every branch." class="mb-4">
		<div class="flex flex-wrap gap-1.5">
			{#each branches.data?.items ?? [] as branch (branch.id)}
				<button
					type="button"
					class="chip h-7 px-2.5 text-xs"
					aria-pressed={form.branchIds.includes(branch.id)}
					onclick={() => (form.branchIds = toggle(form.branchIds, branch.id))}
				>
					{branch.name}
				</button>
			{/each}
		</div>
	</Field>

	<Field label="Categories" hint="Restrict it to part of the menu.">
		<div class="flex flex-wrap gap-1.5">
			{#each categories.data?.items ?? [] as category (category.id)}
				<button
					type="button"
					class="chip h-7 px-2.5 text-xs"
					aria-pressed={form.categoryIds.includes(category.id)}
					onclick={() => (form.categoryIds = toggle(form.categoryIds, category.id))}
				>
					{category.name}
				</button>
			{/each}
		</div>
	</Field>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (formOpen = false)}>Cancel</Button>
		<Button
			loading={saving}
			disabled={!form.name.trim() ||
				(form.type === 'PERCENT' && !form.percent) ||
				(form.type === 'FIXED' && !form.amount)}
			onclick={save}
		>
			{editingId ? 'Save changes' : 'Create promotion'}
		</Button>
	{/snippet}
</Modal>

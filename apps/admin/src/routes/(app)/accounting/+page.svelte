<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import { formatDate, formatMoney, formatNumber, shiftDay, todayISO } from '#lib/format';
	import PageHead from '#lib/ui/page-head.svelte';
	import DateRange from '#lib/ui/date-range.svelte';
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
	import Scale from '@lucide/svelte/icons/scale';
	import Plus from '@lucide/svelte/icons/plus';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Receipt from '@lucide/svelte/icons/receipt';
	import Banknote from '@lucide/svelte/icons/banknote';
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';

	const queryClient = useQueryClient();

	type Tab = 'closing' | 'expenses' | 'ledger';
	let tab = $state<Tab>('closing');

	// ── the closing window ────────────────────────────────────────────────
	const today = todayISO();
	let from = $state(shiftDay(today, -29));
	let to = $state(today);

	const pl = createQuery(() => ({
		queryKey: ['accounting', 'pl', from, to],
		queryFn: () => api.profitLoss(from, to),
		enabled: $authenticated
	}));

	const closings = createQuery(() => ({
		queryKey: ['accounting', 'closings', $branchId],
		queryFn: () => api.listDailyClosings($branchId ?? undefined),
		enabled: $authenticated
	}));

	const drawings = createQuery(() => ({
		queryKey: ['accounting', 'journal'],
		queryFn: () => api.listJournal(),
		enabled: $authenticated
	}));

	const accounts = createQuery(() => ({
		queryKey: ['accounting', 'accounts'],
		queryFn: () => api.listAccounts(),
		enabled: $authenticated
	}));

	const expenses = createQuery(() => ({
		queryKey: ['accounting', 'expenses'],
		queryFn: () => api.listExpenses({ pageSize: 100 }),
		enabled: $authenticated
	}));

	const accountName = (id: string) => accounts.data?.find((row) => row.id === id)?.name ?? '—';

	/** Income and expense come back already signed; net is income − expense. */
	const income = $derived(Number(pl.data?.income ?? 0));
	/** Expense comes back already signed the same way income is, so the two
	 *  cancel without a second negation. */
	const margin = $derived(income > 0 ? (Number(pl.data?.netProfit ?? 0) / income) * 100 : 0);

	const latestClosing = $derived(closings.data?.[0] ?? null);
	const closedToday = $derived(closings.data?.some((row) => row.businessDate === today) ?? false);

	const expenseTotal = $derived(
		(expenses.data?.items ?? []).reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0)
	);

	// ── run a closing ─────────────────────────────────────────────────────
	let closing = $state(false);
	const runClosing = async () => {
		if (!$branchId) {
			toast.error('Pick a branch first — a closing belongs to one till.');
			return;
		}
		closing = true;
		try {
			const result = await api.dailyClosing($branchId, today);
			await queryClient.invalidateQueries({ queryKey: ['accounting'] });
			toast.success(`Closed ${formatDate(result.businessDate)}`, {
				description: `${result.orderCount} orders · ${formatMoney(result.netSales)}`
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not close the day');
		} finally {
			closing = false;
		}
	};

	// ── record an expense ─────────────────────────────────────────────────
	let expenseOpen = $state(false);
	let savingExpense = $state(false);
	let expenseForm = $state({
		category: '',
		amount: '',
		expenseDate: today,
		note: '',
		paidFrom: 'CASH' as 'CASH' | 'BANK'
	});

	const CATEGORIES = [
		'Utilities',
		'Rent',
		'Supplies',
		'Maintenance',
		'Marketing',
		'Transport',
		'Salaries'
	];

	const openExpense = () => {
		expenseForm = { category: '', amount: '', expenseDate: today, note: '', paidFrom: 'CASH' };
		expenseOpen = true;
	};

	const saveExpense = async () => {
		savingExpense = true;
		try {
			await api.createExpense({
				category: expenseForm.category.trim(),
				amount: expenseForm.amount,
				expenseDate: expenseForm.expenseDate,
				...(expenseForm.note ? { note: expenseForm.note } : {}),
				paidFrom: expenseForm.paidFrom,
				...($branchId ? { branchId: $branchId } : {})
			});
			await queryClient.invalidateQueries({ queryKey: ['accounting'] });
			toast.success(`${formatMoney(expenseForm.amount)} booked to ${expenseForm.category}`);
			expenseOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not record the expense');
		} finally {
			savingExpense = false;
		}
	};

	const EXPENSE_TONE: Record<string, 'herb' | 'brick'> = { CASH: 'herb', BANK: 'brick' };
</script>

<svelte:head><title>Accounting — ROMS</title></svelte:head>

<PageHead title="Accounting" sub="Track expenses, payments and daily closing.">
	{#snippet actions()}
		<DateRange bind:from bind:to />
		<Button size="sm" variant="outline" onclick={openExpense}>
			<Plus size={14} />
			Expense
		</Button>
		<Button size="sm" loading={closing} disabled={closedToday} onclick={runClosing}>
			<CalendarCheck size={14} />
			{closedToday ? 'Day closed' : 'Close the day'}
		</Button>
	{/snippet}
</PageHead>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
	<Figure
		label="Income"
		value={pl.isPending ? '—' : formatMoney(pl.data?.income ?? '0')}
		sub={`${formatDate(from)} → ${formatDate(to)}`}
	/>
	<Figure
		label="Expenses"
		value={pl.isPending ? '—' : formatMoney(pl.data?.expense ?? '0')}
		sub="Posted to the journal"
	/>
	<Figure
		label="Net profit"
		value={pl.isPending ? '—' : formatMoney(pl.data?.netProfit ?? '0')}
		delta={income > 0 ? `${margin.toFixed(1)}% margin` : undefined}
		deltaTone={Number(pl.data?.netProfit ?? 0) >= 0 ? 'herb' : 'brick'}
		sub="Income less expenses"
	/>
	<Figure
		label="Last closing"
		value={latestClosing ? formatMoney(latestClosing.netSales) : '—'}
		sub={latestClosing ? formatDate(latestClosing.businessDate) : 'No day closed yet'}
	/>
</div>

<div class="mt-4 flex gap-1.5">
	{#each [{ id: 'closing', label: 'Daily closings' }, { id: 'expenses', label: 'Expenses' }, { id: 'ledger', label: 'Journal' }] as option (option.id)}
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

<!-- ── daily closings ───────────────────────────────────────────────────── -->
{#if tab === 'closing'}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="Daily closings" sub="One row per trading day, newest first">
			{#snippet actions()}
				{#if closings.data?.length === 60}
					<Stamp tone="amber" dot={false}>Showing the latest 60</Stamp>
				{/if}
			{/snippet}
		</PlateHead>

		{#if closings.isPending}
			<Skeleton rows={6} />
		{:else if (closings.data?.length ?? 0) === 0}
			<Empty
				icon={CalendarCheck}
				title="No day closed yet"
				body="Closing a day rolls the takings into the journal and gives you a row here to compare against."
			>
				{#snippet action()}
					<Button size="sm" loading={closing} onclick={runClosing}>Close today</Button>
				{/snippet}
			</Empty>
		{:else}
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>Day</th>
							<th class="tbl-num">Orders</th>
							<th class="tbl-num">Gross</th>
							<th class="tbl-num">Discounts</th>
							<th class="tbl-num">Tax</th>
							<th class="tbl-num">Net</th>
						</tr>
					</thead>
					<tbody>
						{#each closings.data ?? [] as day (day.id)}
							<tr>
								<td class="u-mono text-ink text-sm font-[600]">
									{formatDate(day.businessDate)}
								</td>
								<td class="tbl-num u-num text-ink-2 text-sm">
									{formatNumber(Number(day.orderCount))}
								</td>
								<td class="tbl-num u-num text-ink-2 text-sm">
									{formatMoney(day.grossSales)}
								</td>
								<td class="tbl-num u-num text-brick text-sm">
									{Number(day.discounts) > 0 ? `−${formatMoney(day.discounts)}` : '—'}
								</td>
								<td class="tbl-num u-num text-ink-2 text-sm">
									{formatMoney(day.taxTotal)}
								</td>
								<td class="tbl-num u-num text-ink text-sm font-[640]">
									{formatMoney(day.netSales)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Plate>

	<!-- ── expenses ─────────────────────────────────────────────────────────── -->
{:else if tab === 'expenses'}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="Expenses" sub="Everything booked out of the till">
			{#snippet actions()}
				<span class="u-num text-ink text-[12px] font-[620]">
					{expenses.isPending ? '—' : formatMoney(String(expenseTotal / 100))}
				</span>
			{/snippet}
		</PlateHead>

		{#if expenses.isPending}
			<Skeleton rows={6} />
		{:else if (expenses.data?.items.length ?? 0) === 0}
			<Empty
				icon={Receipt}
				title="No expenses recorded"
				body="Rent, utilities, supplies — anything that leaves the till lands here and posts to the journal."
			>
				{#snippet action()}
					<Button size="sm" onclick={openExpense}>Record an expense</Button>
				{/snippet}
			</Empty>
		{:else}
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>Category</th>
							<th class="hidden sm:table-cell">Note</th>
							<th>Paid from</th>
							<th class="tbl-num">Date</th>
							<th class="tbl-num">Amount</th>
						</tr>
					</thead>
					<tbody>
						{#each expenses.data?.items ?? [] as row (row.id)}
							<tr>
								<td class="text-ink text-sm font-[540]">{row.category}</td>
								<td class="text-ink-3 hidden max-w-[280px] truncate text-[12px] sm:table-cell">
									{row.note || '—'}
								</td>
								<td>
									<Stamp tone={EXPENSE_TONE[row.paidFrom] ?? 'neutral'}>{row.paidFrom}</Stamp>
								</td>
								<td class="tbl-num text-ink-3 text-xs">{formatDate(row.expenseDate)}</td>
								<td class="tbl-num u-num text-ink text-sm font-[600]">
									{formatMoney(row.amount)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Plate>

	<!-- ── journal ──────────────────────────────────────────────────────────── -->
{:else}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="Journal" sub="The double-entry trail behind every posting">
			{#snippet actions()}
				{#if accounts.data?.length === 0}
					<Button size="sm" variant="outline" onclick={() => api.seedAccounts()}>
						<BookOpen size={14} />
						Seed the chart
					</Button>
				{/if}
			{/snippet}
		</PlateHead>

		{#if drawings.isPending}
			<Skeleton rows={6} />
		{:else if (drawings.data?.length ?? 0) === 0}
			<Empty
				icon={Scale}
				title="The journal is empty"
				body="Recording an expense or closing a day writes the first entry. Every posting here is balanced debit against credit."
			/>
		{:else}
			<ul class="divide-line divide-y">
				{#each drawings.data ?? [] as entry (entry.id)}
					<li class="px-4 py-3">
						<div class="flex items-baseline justify-between gap-3">
							<div class="min-w-0">
								<p class="text-ink truncate text-sm font-[560]">{entry.memo}</p>
								<p class="text-ink-3 mt-0.5 text-xs">
									{formatDate(entry.entryDate)}
									{#if entry.reference}· <span class="u-mono">{entry.reference}</span>{/if}
								</p>
							</div>
							{#if entry.branchId}
								<Stamp tone="slate" dot={false}>Branch</Stamp>
							{/if}
						</div>

						<table class="mt-2 w-full">
							<tbody>
								{#each entry.lines as line (line.id)}
									{@const debit = Number(line.debit) > 0}
									<tr class="text-xs">
										<td class="text-ink-3 w-[26px] py-0.5">
											{#if debit}<Banknote size={12} />{/if}
										</td>
										<td class="text-ink-2 py-0.5">{accountName(line.accountId)}</td>
										<td class="u-num text-ink-2 py-0.5 text-right">
											{debit ? formatMoney(line.debit) : ''}
										</td>
										<td class="u-num text-ink-2 py-0.5 pl-3 text-right">
											{debit ? '' : formatMoney(line.credit)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>
{/if}

<!-- ── record an expense ────────────────────────────────────────────────── -->
<Modal
	open={expenseOpen}
	onOpenChange={(value) => {
		if (!value) expenseOpen = false;
	}}
	title="Record an expense"
	sub="It posts straight to the journal"
	width={560}
>
	<FormSection title="Expense details" description="What was spent, how much and when.">
		<Field label="Category" for="e-cat" required>
			<Input
				id="e-cat"
				class=""
				bind:value={expenseForm.category}
				placeholder="Utilities"
				list="expense-categories"
			/>
			<datalist id="expense-categories">
				{#each CATEGORIES as category (category)}
					<option value={category}></option>
				{/each}
			</datalist>
		</Field>
		<Field label="Amount" for="e-amt" required>
			<div class="field-shell">
				<Input
					id="e-amt"
					class=" u-num"
					bind:value={expenseForm.amount}
					inputmode="decimal"
					placeholder="0.00"
				/>
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>
		<Field label="Date" for="e-date">
			<Input id="e-date" type="date" class="" bind:value={expenseForm.expenseDate} />
		</Field>
	</FormSection>
	<FormSection title="Payment record" description="Record the payment source and supporting notes.">
		<Field label="Paid from" for="e-from">
			<div class="flex gap-1.5">
				{#each ['CASH', 'BANK'] as option (option)}
					<button
						type="button"
						class="chip h-8 flex-1 justify-center text-xs"
						aria-pressed={expenseForm.paidFrom === option}
						onclick={() => (expenseForm.paidFrom = option as 'CASH' | 'BANK')}
					>
						{option === 'CASH' ? 'Cash' : 'Bank'}
					</button>
				{/each}
			</div>
		</Field>
		<Field label="Note" for="e-note" class="sm:col-span-2">
			<Input
				id="e-note"
				class=""
				bind:value={expenseForm.note}
				placeholder="K-Electric bill for September"
			/>
		</Field>
	</FormSection>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (expenseOpen = false)}>Cancel</Button>
		<Button
			loading={savingExpense}
			disabled={!expenseForm.category.trim() || !expenseForm.amount}
			onclick={saveExpense}
		>
			Record expense
		</Button>
	{/snippet}
</Modal>

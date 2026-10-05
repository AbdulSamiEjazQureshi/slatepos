<script lang="ts">
	import SelectField from '#lib/ui/select-field.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import {
		formatDate,
		formatMoney,
		formatNumber,
		formatTime,
		shiftDay,
		todayISO,
		humanizeEnum
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
	import FormSection from '#lib/ui/form-section.svelte';
	import Figure from '#lib/ui/figure.svelte';
	import IdCard from '@lucide/svelte/icons/id-card';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import HandCoins from '@lucide/svelte/icons/hand-coins';
	import Pencil from '@lucide/svelte/icons/pencil';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plane from '@lucide/svelte/icons/plane';

	const queryClient = useQueryClient();

	type Tab = 'people' | 'roster' | 'today';
	let tab = $state<Tab>('people');
	let query = $state('');

	const employees = createQuery(() => ({
		queryKey: ['staff', 'employees'],
		queryFn: () => api.listEmployees({ pageSize: 200 }),
		enabled: $authenticated
	}));

	const departments = createQuery(() => ({
		queryKey: ['staff', 'departments'],
		queryFn: () => api.listDepartments(),
		enabled: $authenticated
	}));

	const today = todayISO();

	const shifts = createQuery(() => ({
		queryKey: ['staff', 'shifts'],
		// The API filters on startAt only, so ask from today onward to see the
		// roster ahead rather than a truncated slice of the past.
		queryFn: () => api.listShifts({ from: `${today}T00:00:00.000Z` }),
		enabled: $authenticated
	}));

	const attendance = createQuery(() => ({
		queryKey: ['staff', 'attendance'],
		queryFn: () => api.listAttendance(),
		enabled: $authenticated
	}));

	const rows = $derived(employees.data?.items ?? []);
	const departmentName = (id: string | null) =>
		id ? (departments.data?.find((row) => row.id === id)?.name ?? '—') : '—';
	const personName = (id: string) => rows.find((row) => row.id === id)?.fullName ?? 'Unknown';

	const visible = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return rows;
		return rows.filter((row) => row.fullName.toLowerCase().includes(needle));
	});

	const onDuty = $derived(rows.filter((row) => row.status === 'ACTIVE').length);

	const payroll = $derived(
		rows
			.filter((row) => row.status === 'ACTIVE')
			.reduce((sum, row) => sum + Math.round(Number(row.salaryAmount) * 100), 0)
	);

	// ── today's punches ───────────────────────────────────────────────────
	const todayAttendance = $derived(
		(attendance.data ?? [])
			.filter((row) => row.workDate === today)
			.sort((a, b) => (a.checkIn ?? '').toString().localeCompare((b.checkIn ?? '').toString()))
	);

	/** The week grid: seven columns starting today. */
	const week = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const date = shiftDay(today, i);
			return {
				date,
				label:
					i === 0
						? 'Today'
						: new Date(`${date}T12:00:00`).toLocaleDateString('en-PK', { weekday: 'short' }),
				day: new Date(`${date}T12:00:00`).getDate(),
				shifts: (shifts.data ?? []).filter((shift) => String(shift.startAt).slice(0, 10) === date)
			};
		})
	);

	const staffed = $derived(new Set((shifts.data ?? []).map((row) => row.employeeId)).size);

	// ── employee detail ───────────────────────────────────────────────────
	let openFor = $state<string | null>(null);
	const opened = $derived(rows.find((row) => row.id === openFor) ?? null);

	const ledger = createQuery(() => ({
		queryKey: ['staff', 'ledger', openFor],
		queryFn: () => api.employeeLedger(openFor as string),
		enabled: $authenticated && Boolean(openFor)
	}));

	// ── add / edit ────────────────────────────────────────────────────────
	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let form = $state({
		fullName: '',
		phone: '',
		position: '',
		departmentId: '',
		hireDate: today,
		salaryType: 'MONTHLY' as 'MONTHLY' | 'DAILY' | 'HOURLY',
		salaryAmount: '',
		commissionRate: ''
	});

	const openCreate = () => {
		editingId = null;
		form = {
			fullName: '',
			phone: '',
			position: '',
			departmentId: '',
			hireDate: today,
			salaryType: 'MONTHLY',
			salaryAmount: '',
			commissionRate: ''
		};
		formOpen = true;
	};

	const openEdit = () => {
		if (!opened) return;
		editingId = opened.id;
		form = {
			fullName: opened.fullName,
			phone: opened.phone ?? '',
			position: opened.position ?? '',
			departmentId: opened.departmentId ?? '',
			hireDate: opened.hireDate ?? today,
			salaryType: opened.salaryType,
			salaryAmount: opened.salaryAmount,
			commissionRate: opened.commissionRate
		};
		formOpen = true;
	};

	const save = async () => {
		if (!form.fullName.trim()) return;
		saving = true;
		try {
			const pay = {
				fullName: form.fullName.trim(),
				...(form.phone ? { phone: form.phone } : {}),
				...(form.position ? { position: form.position } : {}),
				...(form.departmentId ? { departmentId: form.departmentId } : {}),
				hireDate: form.hireDate,
				salaryType: form.salaryType,
				salaryAmount: form.salaryAmount || '0',
				commissionRate: form.commissionRate || '0'
			};
			if (editingId) {
				// The pay fields are sent explicitly even on a small edit: the
				// route's defaults once overwrote them, and an update should
				// never change what someone is paid by omission.
				await api.updateEmployee(editingId, pay);
				toast.success(`${pay.fullName} updated`);
			} else {
				await api.createEmployee({ ...pay, ...($branchId ? { branchId: $branchId } : {}) });
				toast.success(`${pay.fullName} is on the team`);
			}
			await queryClient.invalidateQueries({ queryKey: ['staff'] });
			formOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save the employee');
		} finally {
			saving = false;
		}
	};

	// ── set status ────────────────────────────────────────────────────────
	const setStatus = async (id: string, status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED') => {
		const person = rows.find((row) => row.id === id);
		if (!person) return;
		try {
			// Full pay payload: a status change must not disturb their terms.
			await api.updateEmployee(id, {
				status,
				salaryType: person.salaryType,
				salaryAmount: person.salaryAmount,
				commissionRate: person.commissionRate
			});
			await queryClient.invalidateQueries({ queryKey: ['staff'] });
			toast.success(`${person.fullName} marked ${status.toLowerCase()}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change their status');
		}
	};

	// ── attendance ────────────────────────────────────────────────────────
	let punchOpen = $state(false);
	let savingPunch = $state(false);
	let punch = $state({
		employeeId: '',
		status: 'PRESENT' as 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY',
		notes: ''
	});

	const openPunch = () => {
		punch = { employeeId: rows[0]?.id ?? '', status: 'PRESENT', notes: '' };
		punchOpen = true;
	};

	const savePunch = async () => {
		if (!punch.employeeId) return;
		savingPunch = true;
		try {
			await api.recordAttendance({
				employeeId: punch.employeeId,
				workDate: today,
				status: punch.status,
				source: 'MANUAL',
				...(punch.notes ? { notes: punch.notes } : {})
			});
			await queryClient.invalidateQueries({ queryKey: ['staff', 'attendance'] });
			toast.success(`${personName(punch.employeeId)} marked ${punch.status.toLowerCase()}`);
			punchOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not record the punch');
		} finally {
			savingPunch = false;
		}
	};

	// ── advance ───────────────────────────────────────────────────────────
	let advanceOpen = $state(false);
	let savingAdvance = $state(false);
	let advance = $state({ employeeId: '', amount: '', reason: '' });

	const openAdvance = () => {
		advance = { employeeId: rows[0]?.id ?? '', amount: '', reason: '' };
		advanceOpen = true;
	};

	const issueAdvance = async () => {
		if (!advance.employeeId || !advance.amount) return;
		savingAdvance = true;
		try {
			await api.createAdvance({
				employeeId: advance.employeeId,
				amount: advance.amount,
				...(advance.reason ? { reason: advance.reason } : {})
			});
			await queryClient.invalidateQueries({ queryKey: ['staff'] });
			toast.success(`${formatMoney(advance.amount)} advanced to ${personName(advance.employeeId)}`);
			advanceOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not issue the advance');
		} finally {
			savingAdvance = false;
		}
	};

	// ── leave ─────────────────────────────────────────────────────────────
	let leaveOpen = $state(false);
	let savingLeave = $state(false);
	let leave = $state({
		employeeId: '',
		fromDate: today,
		toDate: today,
		type: 'ANNUAL',
		reason: ''
	});

	const openLeave = () => {
		leave = {
			employeeId: rows[0]?.id ?? '',
			fromDate: today,
			toDate: today,
			type: 'ANNUAL',
			reason: ''
		};
		leaveOpen = true;
	};

	const requestLeave = async () => {
		if (!leave.employeeId) return;
		savingLeave = true;
		try {
			await api.requestLeave({
				employeeId: leave.employeeId,
				fromDate: leave.fromDate,
				toDate: leave.toDate,
				type: leave.type,
				...(leave.reason ? { reason: leave.reason } : {})
			});
			await queryClient.invalidateQueries({ queryKey: ['staff'] });
			toast.success('Leave requested');
			leaveOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not file the leave');
		} finally {
			savingLeave = false;
		}
	};

	const STATUS_TONE: Record<string, 'herb' | 'amber' | 'brick' | 'neutral'> = {
		ACTIVE: 'herb',
		INACTIVE: 'amber',
		TERMINATED: 'brick'
	};
	const ATTEND_TONE: Record<string, 'herb' | 'amber' | 'brick' | 'slate' | 'neutral'> = {
		PRESENT: 'herb',
		LATE: 'amber',
		ABSENT: 'brick',
		LEAVE: 'slate',
		HOLIDAY: 'neutral'
	};
	const MINUTES_IN_DAY = 24 * 60;
	/** Position a shift on the day column: start and length, as percentages. */
	const shiftGeometry = (shift: { startAt: string | Date; endAt: string | Date }) => {
		const start = new Date(shift.startAt);
		const end = new Date(shift.endAt);
		const minutesIn = start.getHours() * 60 + start.getMinutes();
		const length = Math.max(30, (end.getTime() - start.getTime()) / 60000);
		return `top: ${(minutesIn / MINUTES_IN_DAY) * 100}%; height: ${(length / MINUTES_IN_DAY) * 100}%`;
	};
</script>

<svelte:head><title>Staff — ROMS</title></svelte:head>

<PageHead title="Staff" sub="Who is on the team, when they work and what the books owe them">
	{#snippet actions()}
		<Button size="sm" variant="outline" onclick={openAdvance} disabled={rows.length === 0}>
			<HandCoins size={14} />
			Advance
		</Button>
		<Button size="sm" onclick={openCreate}>
			<Plus size={14} />
			Add employee
		</Button>
	{/snippet}
</PageHead>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
	<Figure
		label="Active"
		value={employees.isPending ? '—' : formatNumber(onDuty)}
		sub={`${formatNumber(rows.length)} on the books in total`}
	/>
	<Figure
		label="Monthly payroll"
		value={employees.isPending ? '—' : formatMoney(String(payroll / 100))}
		sub="Committed across active staff"
	/>
	<Figure
		label="Rostered ahead"
		value={shifts.isPending ? '—' : formatNumber(staffed)}
		sub="People with a shift in the next week"
	/>
</div>

<div class="mt-4 flex flex-wrap items-center gap-1.5">
	{#each [{ id: 'people', label: 'People' }, { id: 'roster', label: 'Roster' }, { id: 'today', label: "Today's punches" }] as option (option.id)}
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

<!-- ── people ───────────────────────────────────────────────────────────── -->
{#if tab === 'people'}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="The team" sub="Tap anyone to see their ledger and terms">
			{#snippet actions()}
				<div class="field-shell h-8 min-w-[190px]">
					<Search />
					<Input
						aria-label="Search"
						class=" text-sm"
						bind:value={query}
						placeholder="Find someone…"
					/>
				</div>
			{/snippet}
		</PlateHead>

		{#if employees.isPending}
			<Skeleton rows={7} />
		{:else if rows.length === 0}
			<Empty
				icon={IdCard}
				title="Nobody on the team yet"
				body="Add your staff, set their terms, and their shifts, punches and advances all land against their name."
			>
				{#snippet action()}
					<Button size="sm" onclick={openCreate}>Add employee</Button>
				{/snippet}
			</Empty>
		{:else if visible.length === 0}
			<Empty icon={Search} title="Nobody matches that" body="Try another name." />
		{:else}
			<ul class="divide-line divide-y">
				{#each visible as person (person.id)}
					<li>
						<button
							type="button"
							class="group hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
							onclick={() => (openFor = person.id)}
						>
							<span
								class="border-line bg-surface-2 text-ink-2 grid size-8 shrink-0 place-items-center rounded-sm
									border text-xs font-[640]"
							>
								{person.fullName.slice(0, 2).toUpperCase()}
							</span>
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-2">
									<span class="text-ink truncate text-sm font-[560]">{person.fullName}</span>
									<Stamp tone={STATUS_TONE[person.status] ?? 'neutral'}
										>{humanizeEnum(person.status)}</Stamp
									>
								</span>
								<span class="text-ink-3 mt-0.5 block truncate text-xs">
									{person.position || 'No position set'}
									{#if person.departmentId}· {departmentName(person.departmentId)}{/if}
								</span>
							</span>
							<span class="u-num text-ink-2 hidden shrink-0 text-right text-[12px] sm:block">
								{formatMoney(person.salaryAmount)}
								<span class="text-ink-3 block text-xs">
									{person.salaryType === 'MONTHLY'
										? 'per month'
										: person.salaryType === 'DAILY'
											? 'per day'
											: 'per hour'}
								</span>
							</span>
							<ChevronRight size={15} class="text-ink-3 shrink-0" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>

	<!-- ── roster ───────────────────────────────────────────────────────────── -->
{:else if tab === 'roster'}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="The week ahead" sub="Shifts by day, newest first">
			{#snippet actions()}
				{#if shifts.data?.length === 500}
					<Stamp tone="amber" dot={false}>Showing the first 500</Stamp>
				{/if}
			{/snippet}
		</PlateHead>

		{#if shifts.isPending}
			<Skeleton rows={6} />
		{:else if (shifts.data?.length ?? 0) === 0}
			<Empty
				icon={CalendarClock}
				title="No shifts rostered"
				body="There is no roster builder in this screen yet — shifts are read here as they are scheduled."
			/>
		{:else}
			<div class="bg-line grid grid-cols-7 gap-px overflow-x-auto">
				{#each week as day (day.date)}
					<div class="bg-surface-1 min-w-[110px]">
						<div class="border-line border-b px-2 py-2 text-center">
							<p class="text-ink text-xs font-[600]">{day.label}</p>
							<p class="u-num text-ink-3 text-xs">{day.day}</p>
						</div>
						<div class="relative h-[220px]">
							{#each day.shifts as shift (shift.id)}
								<div
									class="border-brass-line bg-brass-wash absolute inset-x-0.5 overflow-hidden rounded-xs border px-1.5 py-1"
									style={shiftGeometry(shift)}
								>
									<p class="text-brass-ink truncate text-xs font-[600]">
										{personName(shift.employeeId)}
									</p>
									<p class="u-num text-ink-3 truncate text-[9.5px]">
										{formatTime(shift.startAt)}
									</p>
								</div>
							{:else}
								<p class="text-ink-3 absolute inset-0 grid place-items-center text-xs">Nobody</p>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Plate>

	<!-- ── today's punches ──────────────────────────────────────────────────── -->
{:else}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="Today's punches" sub={formatDate(today)}>
			{#snippet actions()}
				<Button size="sm" variant="outline" onclick={openPunch} disabled={rows.length === 0}>
					<Fingerprint size={14} />
					Record one
				</Button>
			{/snippet}
		</PlateHead>

		{#if attendance.isPending}
			<Skeleton rows={5} />
		{:else if todayAttendance.length === 0}
			<Empty
				icon={Fingerprint}
				title="Nobody has punched in"
				body="Record attendance here, or let a biometric device post it — either way it lands against the roster."
			>
				{#snippet action()}
					<Button size="sm" onclick={openPunch} disabled={rows.length === 0}>Record a punch</Button>
				{/snippet}
			</Empty>
		{:else}
			<ul class="divide-line divide-y">
				{#each todayAttendance as row (row.id)}
					<li class="flex items-center gap-3 px-4 py-2.5">
						<span class="u-num text-ink-2 w-[70px] shrink-0 text-[12px]">
							{row.checkIn ? formatTime(row.checkIn) : '—'}
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm font-[540]">{personName(row.employeeId)}</p>
							{#if row.notes}
								<p class="text-ink-3 truncate text-xs">{row.notes}</p>
							{/if}
						</div>
						{#if row.minutesWorked > 0}
							<span class="u-num text-ink-3 shrink-0 text-xs">
								{Math.floor(row.minutesWorked / 60)}h {row.minutesWorked % 60}m
							</span>
						{/if}
						<Stamp tone={ATTEND_TONE[row.status] ?? 'neutral'}>{humanizeEnum(row.status)}</Stamp>
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>
{/if}

<!-- ── employee detail ──────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={openFor !== null}
	onOpenChange={(value) => {
		if (!value) openFor = null;
	}}
	title={opened?.fullName ?? 'Employee'}
	sub={opened?.position ?? undefined}
	width={680}
>
	{#if opened}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<Figure
				label="Balance owed"
				value={ledger.isPending ? '—' : formatMoney(ledger.data?.balance ?? '0')}
				sub="Advances less any payments"
				wide
			/>
			<Figure
				label="Pay"
				value={formatMoney(opened.salaryAmount)}
				sub={opened.salaryType === 'MONTHLY'
					? 'Per month'
					: opened.salaryType === 'DAILY'
						? 'Per day'
						: 'Per hour'}
			/>
			<Figure
				label="Commission"
				value={Number(opened.commissionRate) > 0
					? `${(Number(opened.commissionRate) * 100).toFixed(2)}%`
					: '—'}
				sub="On attributed sales"
			/>
		</div>

		<dl class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
			<div>
				<dt class="u-label">Phone</dt>
				<dd class="text-ink mt-1 text-sm">{opened.phone ?? '—'}</dd>
			</div>
			<div>
				<dt class="u-label">Department</dt>
				<dd class="text-ink mt-1 text-sm">{departmentName(opened.departmentId)}</dd>
			</div>
			<div>
				<dt class="u-label">Hired</dt>
				<dd class="text-ink mt-1 text-sm">
					{opened.hireDate ? formatDate(opened.hireDate) : '—'}
				</dd>
			</div>
			<div>
				<dt class="u-label">Status</dt>
				<dd class="mt-1">
					<Stamp tone={STATUS_TONE[opened.status] ?? 'neutral'}>{humanizeEnum(opened.status)}</Stamp
					>
				</dd>
			</div>
		</dl>

		<div class="perf-rule my-4"></div>

		<p class="u-label mb-2">Ledger</p>
		{#if ledger.isPending}
			<Skeleton rows={3} />
		{:else if (ledger.data?.entries.length ?? 0) === 0}
			<div class="border-line rounded-sm border border-dashed py-7 text-center">
				<p class="text-ink-2 text-sm font-[540]">Nothing on the ledger</p>
				<p class="text-ink-3 mx-auto mt-1 max-w-[38ch] text-xs">
					Issue an advance and it appears here with a running balance.
				</p>
			</div>
		{:else}
			<ul class="divide-line divide-y">
				{#each ledger.data?.entries ?? [] as entry (entry.id)}
					{@const debit = Number(entry.debit) > 0}
					<li class="flex items-center gap-3 py-2.5">
						<div class="min-w-0 flex-1">
							<p class="text-ink text-sm font-[540]">{humanizeEnum(entry.entryType)}</p>
							<p class="text-ink-3 text-xs">
								{formatDate(entry.createdAt)}{#if entry.reference}
									· {entry.reference}{/if}
							</p>
						</div>
						<div class="shrink-0 text-right">
							<p class="u-num text-sm font-[600] {debit ? 'text-ink' : 'text-herb'}">
								{debit ? '+' : '−'}{formatMoney(debit ? entry.debit : entry.credit)}
							</p>
							<p class="u-num text-ink-3 text-xs">
								balance {formatMoney(entry.balanceAfter)}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="mt-4 flex flex-wrap gap-1.5">
			<Button size="sm" variant="outline" onclick={openEdit}>
				<Pencil size={14} />
				Edit employee
			</Button>
			<Button size="sm" variant="outline" onclick={openLeave}>
				<Plane size={14} />
				File leave
			</Button>
			{#if opened.status === 'ACTIVE'}
				<Button size="sm" variant="ghost" onclick={() => setStatus(opened.id, 'INACTIVE')}>
					Set inactive
				</Button>
			{:else}
				<Button size="sm" variant="ghost" onclick={() => setStatus(opened.id, 'ACTIVE')}>
					Set active
				</Button>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (openFor = null)}>Close</Button>
	{/snippet}
</Modal>

<!-- ── add / edit ───────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={formOpen}
	onOpenChange={(value) => {
		if (!value) formOpen = false;
	}}
	title={editingId ? 'Edit employee' : 'Add employee'}
	sub={editingId
		? 'Pay changes take effect from the next payroll run'
		: 'Only a name is required up front'}
	width={620}
>
	<FormSection title="Employee details" description="Contact information and role in your team.">
		<Field label="Full name" for="p-name" required class="sm:col-span-2">
			<Input
				autocomplete="name"
				id="p-name"
				class=""
				bind:value={form.fullName}
				placeholder="Bilal Ahmed"
			/>
		</Field>
		<Field label="Phone" for="p-phone">
			<Input
				type="tel"
				autocomplete="tel"
				id="p-phone"
				class=""
				bind:value={form.phone}
				placeholder="+92 300 0000000"
			/>
		</Field>
		<Field label="Position" for="p-pos">
			<Input id="p-pos" class="" bind:value={form.position} placeholder="Head chef" />
		</Field>
		<Field label="Department" for="p-dept">
			<SelectField
				id="p-dept"
				class=""
				bind:value={form.departmentId}
				items={[
					{ value: '', label: `No department` },
					...(departments.data ?? [])
						.map((department) => [{ value: department.id, label: `${department.name}` }])
						.flat()
				]}
			/>
		</Field>
		<Field label="Hire date" for="p-hire">
			<Input id="p-hire" type="date" class="" bind:value={form.hireDate} />
		</Field>
	</FormSection>
	<FormSection title="Compensation" description="Pay frequency, base salary and commission.">
		<Field label="Pay frequency" for="p-type">
			<div class="border-line flex rounded-sm border p-0.5">
				{#each ['MONTHLY', 'DAILY', 'HOURLY'] as option (option)}
					<button
						type="button"
						class="chip h-7 flex-1 justify-center rounded-xs text-xs"
						aria-pressed={form.salaryType === option}
						onclick={() => (form.salaryType = option as typeof form.salaryType)}
					>
						{humanizeEnum(option)}
					</button>
				{/each}
			</div>
		</Field>
		<Field label="Salary amount" for="p-amt">
			<div class="field-shell">
				<Input
					id="p-amt"
					class=" u-num"
					bind:value={form.salaryAmount}
					inputmode="decimal"
					placeholder="0.00"
				/>
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>
		<Field
			label="Commission"
			hint="Percentage of sales paid as commission."
			for="p-comm"
			class="sm:col-span-2"
		>
			<div class="field-shell">
				<Input
					id="p-comm"
					class=" u-num"
					inputmode="decimal"
					placeholder="0"
					value={form.commissionRate ? String(Number(form.commissionRate) * 100) : ''}
					oninput={(e) =>
						(form.commissionRate = String((Number(e.currentTarget.value) || 0) / 100))}
				/>
				<span class="text-ink-3 pr-3 text-[12px]">%</span>
			</div>
		</Field>
	</FormSection>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (formOpen = false)}>Cancel</Button>
		<Button loading={saving} disabled={!form.fullName.trim()} onclick={save}>
			{editingId ? 'Save changes' : 'Add employee'}
		</Button>
	{/snippet}
</Modal>

<!-- ── advance ──────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={advanceOpen}
	onOpenChange={(value) => {
		if (!value) advanceOpen = false;
	}}
	title="Issue an advance"
	sub="It posts to their ledger straight away"
	width={480}
>
	<div class="form-stack">
		<Field label="Employee" for="a-who">
			<SelectField
				id="a-who"
				class=""
				bind:value={advance.employeeId}
				items={[
					...rows.map((person) => [{ value: person.id, label: `${person.fullName}` }]).flat()
				]}
			/>
		</Field>
		<Field label="Amount" for="a-amt" required>
			<div class="field-shell">
				<Input
					id="a-amt"
					class=" u-num"
					bind:value={advance.amount}
					inputmode="decimal"
					placeholder="0.00"
				/>
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>
		<Field label="Reason" for="a-why">
			<Input
				id="a-why"
				class=""
				bind:value={advance.reason}
				placeholder="Salary advance for October"
			/>
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (advanceOpen = false)}>Cancel</Button>
		<Button
			loading={savingAdvance}
			disabled={!advance.amount || !advance.employeeId}
			onclick={issueAdvance}
		>
			Issue advance
		</Button>
	{/snippet}
</Modal>

<!-- ── leave ────────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={leaveOpen}
	onOpenChange={(value) => {
		if (!value) leaveOpen = false;
	}}
	title="File leave"
	sub={opened?.fullName}
	width={480}
>
	<div class="form-stack">
		<Field label="Employee" for="l-who">
			<SelectField
				id="l-who"
				class=""
				bind:value={leave.employeeId}
				items={[
					...rows.map((person) => [{ value: person.id, label: `${person.fullName}` }]).flat()
				]}
			/>
		</Field>
		<div class="form-grid">
			<Field label="From" for="l-from">
				<Input id="l-from" type="date" class="" bind:value={leave.fromDate} />
			</Field>
			<Field label="To" for="l-to">
				<Input id="l-to" type="date" class="" bind:value={leave.toDate} />
			</Field>
		</div>
		<Field label="Type" for="l-type">
			<div class="flex flex-wrap gap-1.5">
				{#each ['ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY'] as option (option)}
					<button
						type="button"
						class="chip h-7 px-2.5 text-xs"
						aria-pressed={leave.type === option}
						onclick={() => (leave.type = option)}
					>
						{humanizeEnum(option)}
					</button>
				{/each}
			</div>
		</Field>
		<Field label="Reason" for="l-reason">
			<Input id="l-reason" class="" bind:value={leave.reason} />
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (leaveOpen = false)}>Cancel</Button>
		<Button loading={savingLeave} disabled={!leave.employeeId} onclick={requestLeave}
			>File leave</Button
		>
	{/snippet}
</Modal>

<!-- ── record a punch ───────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={punchOpen}
	onOpenChange={(value) => {
		if (!value) punchOpen = false;
	}}
	title="Record a punch"
	sub="Attendance for {formatDate(today)} — for when nobody tapped a device"
	width={480}
>
	<div class="form-stack">
		<Field label="Employee" for="pu-who" required>
			<SelectField
				id="pu-who"
				class=""
				bind:value={punch.employeeId}
				items={[
					...rows.map((person) => [{ value: person.id, label: `${person.fullName}` }]).flat()
				]}
			/>
		</Field>

		<Field label="Attendance status" for="pu-status">
			<div class="flex flex-wrap gap-1.5">
				{#each ['PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'HOLIDAY'] as option (option)}
					<button
						type="button"
						class="chip h-7 px-2.5 text-xs"
						aria-pressed={punch.status === option}
						onclick={() => (punch.status = option as typeof punch.status)}
					>
						{humanizeEnum(option)}
					</button>
				{/each}
			</div>
		</Field>

		<Field label="Note" hint="Why it was entered by hand, if that matters later." for="pu-note">
			<Input id="pu-note" class="" bind:value={punch.notes} />
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (punchOpen = false)}>Cancel</Button>
		<Button loading={savingPunch} disabled={!punch.employeeId} onclick={savePunch}>Record it</Button
		>
	{/snippet}
</Modal>

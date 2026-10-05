<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { SvelteSet } from 'svelte/reactivity';
	import { onMount } from 'svelte';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import { onRealtime } from '#lib/realtime';
	import { litKeys, isLit } from '#lib/live';
	import { statusStyle } from '#lib/status';
	import type { TableStatus } from '@roms/contracts/enums';
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
	import Armchair from '@lucide/svelte/icons/armchair';
	import Plus from '@lucide/svelte/icons/plus';
	import Merge from '@lucide/svelte/icons/merge';
	import Split from '@lucide/svelte/icons/split';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Check from '@lucide/svelte/icons/check';

	const queryClient = useQueryClient();

	// The canvas is a fixed grid in "plan units"; tables sit on whole cells.
	const CELL = 96;
	const COLS = 12;
	const ROWS = 7;

	let floorId = $state<string | null>(null);
	let view = $state<'floor' | 'list'>('list');

	const floors = createQuery(() => ({
		queryKey: ['tables', 'floors', $branchId],
		queryFn: () => api.listFloors({ branchId: $branchId ?? undefined }),
		enabled: $authenticated
	}));

	const tables = createQuery(() => ({
		queryKey: ['tables', 'list', $branchId],
		queryFn: () => api.listTables({ branchId: $branchId ?? undefined }),
		enabled: $authenticated
	}));

	const reservations = createQuery(() => ({
		queryKey: ['tables', 'reservations', $branchId],
		queryFn: () => api.listReservations({ branchId: $branchId ?? undefined }),
		enabled: $authenticated
	}));

	onMount(() => {
		const dispose = onRealtime((event) => {
			if (
				event.type === 'table.status_changed' ||
				event.type.startsWith('order.') ||
				event.type === 'payment.status_changed'
			) {
				queryClient.invalidateQueries({ queryKey: ['tables'] });
				queryClient.invalidateQueries({ queryKey: ['orders'] });
			}
		});
		return dispose;
	});

	const allTables = $derived(tables.data ?? []);
	const allFloors = $derived(floors.data ?? []);

	const shown = $derived(
		floorId ? allTables.filter((table) => table.floorId === floorId) : allTables
	);

	const counts = $derived.by(() => {
		const map: Record<string, number> = {};
		for (const table of allTables) map[table.status] = (map[table.status] ?? 0) + 1;
		return map;
	});

	// ── dragging a table to a new position on the plan ────────────────────
	let dragging = $state<string | null>(null);
	/** Local, optimistic position while a drag is in flight — keyed by table id. */
	let positions = $state<Record<string, { x: number; y: number }>>({});

	const displayedSeats = $derived.by(() => {
		const seats: Record<string, { x: number; y: number }> = {};
		const occupied = new SvelteSet<string>();
		const unplaced: typeof shown = [];
		for (const table of shown) {
			const seat = positions[table.id] ?? { x: table.positionX, y: table.positionY };
			const key = `${seat.x}:${seat.y}`;
			if (occupied.has(key) || seat.x < 0 || seat.x >= COLS || seat.y < 0 || seat.y >= ROWS) {
				unplaced.push(table);
			} else {
				seats[table.id] = seat;
				occupied.add(key);
			}
		}
		for (const table of unplaced) {
			let cell = 0;
			while (occupied.has(`${cell % COLS}:${Math.floor(cell / COLS)}`)) cell++;
			const seat = { x: cell % COLS, y: Math.floor(cell / COLS) };
			seats[table.id] = seat;
			occupied.add(`${seat.x}:${seat.y}`);
		}
		return { seats, arranged: unplaced.length > 0 };
	});
	const seatOf = (table: { id: string; positionX: number; positionY: number }) =>
		displayedSeats.seats[table.id] ?? { x: table.positionX, y: table.positionY };

	const onDragStart = (id: string, event: DragEvent) => {
		dragging = id;
		event.dataTransfer?.setData('text/plain', id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	};

	const onDrop = async (event: DragEvent) => {
		event.preventDefault();
		const id = dragging ?? event.dataTransfer?.getData('text/plain');
		dragging = null;
		if (!id) return;

		const canvas = event.currentTarget as HTMLElement;
		const rect = canvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(COLS - 1, Math.round((event.clientX - rect.left) / CELL - 0.5)));
		const y = Math.max(0, Math.min(ROWS - 1, Math.round((event.clientY - rect.top) / CELL - 0.5)));

		if (shown.some((table) => table.id !== id && seatOf(table).x === x && seatOf(table).y === y)) {
			toast.info('That position already has a table. Choose an empty space.');
			return;
		}
		const before = positions[id];
		positions = { ...positions, [id]: { x, y } };
		try {
			await api.updateTable(id, { positionX: x, positionY: y } as never);
			await queryClient.invalidateQueries({ queryKey: ['tables', 'list'] });
		} catch (error) {
			// Put it back where it was — the plan must not lie about the room.
			const reverted = { ...positions };
			if (before) reverted[id] = before;
			else delete reverted[id];
			positions = reverted;
			toast.error(error instanceof Error ? error.message : 'Could not move that table');
		}
	};

	// ── table actions ─────────────────────────────────────────────────────
	let selected = $state<string | null>(null);
	const selectedTable = $derived(allTables.find((table) => table.id === selected) ?? null);

	const setStatus = async (id: string, status: TableStatus) => {
		try {
			await api.setTableStatus(id, status);
			await queryClient.invalidateQueries({ queryKey: ['tables'] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change the table');
		}
	};

	let mergeOpen = $state(false);
	let mergeInto = $state<string[]>([]);
	let busy = $state(false);

	const merge = async () => {
		if (!selected || mergeInto.length === 0) return;
		busy = true;
		try {
			await api.mergeTables(selected, mergeInto);
			await queryClient.invalidateQueries({ queryKey: ['tables'] });
			toast.success(`Joined ${mergeInto.length + 1} tables`);
			mergeOpen = false;
			mergeInto = [];
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not join the tables');
		} finally {
			busy = false;
		}
	};

	const split = async () => {
		if (!selected) return;
		try {
			const result = await api.splitTable(selected);
			await queryClient.invalidateQueries({ queryKey: ['tables'] });
			toast.success(
				result.released ? `Released ${result.released} joined tables` : 'Table is back in service'
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not split the table');
		}
	};

	// ── add a table ───────────────────────────────────────────────────────
	let addOpen = $state(false);
	let saving = $state(false);
	let form = $state({ name: '', capacity: 2, positionX: 0, positionY: 0 });

	const openAdd = () => {
		// Drop the new table on the first free cell so it is never hidden.
		const used = new Set(allTables.map((t) => `${t.positionX},${t.positionY}`));
		let x = 0;
		let y = 0;
		for (let i = 0; i < COLS * ROWS; i += 1) {
			x = i % COLS;
			y = Math.floor(i / COLS);
			if (!used.has(`${x},${y}`)) break;
		}
		form = { name: '', capacity: 2, positionX: x, positionY: y };
		addOpen = true;
	};

	const addTable = async () => {
		saving = true;
		try {
			await api.createTable({
				name: form.name.trim(),
				capacity: form.capacity,
				positionX: form.positionX,
				positionY: form.positionY,
				...(floorId ? { floorId } : {}),
				...(($branchId as string | null) ? { branchId: $branchId } : {})
			} as never);
			await queryClient.invalidateQueries({ queryKey: ['tables', 'list'] });
			toast.success(`${form.name} is on the floor`);
			addOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not add the table');
		} finally {
			saving = false;
		}
	};

	/** Tables that can still be joined to the selected one. */
	const joinable = $derived(
		allTables.filter(
			(table) => table.id !== selected && table.status !== 'OUT_OF_SERVICE' && table.isActive
		)
	);

	const upcoming = $derived(
		(reservations.data ?? [])
			.filter((row) => new Date(row.reservedFrom).getTime() > Date.now() - 3600_000)
			.slice(0, 6)
	);
</script>

<svelte:head><title>Tables — ROMS</title></svelte:head>

<PageHead
	title="Tables"
	sub={`${allTables.length} tables · ${counts.OCCUPIED ?? 0} occupied · drag a table to lay out the room`}
>
	{#snippet actions()}
		<div class="border-line flex rounded-sm border p-0.5">
			<button
				type="button"
				class="chip h-7 rounded-xs px-2.5 text-xs"
				aria-pressed={view === 'floor'}
				onclick={() => (view = 'floor')}
			>
				Plan
			</button>
			<button
				type="button"
				class="chip h-7 rounded-xs px-2.5 text-xs"
				aria-pressed={view === 'list'}
				onclick={() => (view = 'list')}
			>
				List
			</button>
		</div>
		<Button size="sm" onclick={openAdd}>
			<Plus size={14} />
			Add table
		</Button>
	{/snippet}
</PageHead>

<div class="mb-3 flex flex-wrap items-center gap-1.5">
	<button
		type="button"
		class="chip"
		aria-pressed={floorId === null}
		onclick={() => (floorId = null)}
	>
		Every room
		<span class="chip-count">{allTables.length}</span>
	</button>
	{#each allFloors as floor (floor.id)}
		<button
			type="button"
			class="chip"
			aria-pressed={floorId === floor.id}
			onclick={() => (floorId = floor.id)}
		>
			{floor.name}
			<span class="chip-count">
				{allTables.filter((table) => table.floorId === floor.id).length}
			</span>
		</button>
	{/each}

	{#each ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'OUT_OF_SERVICE'] as key (key)}
		{#if counts[key]}
			<span class="ml-auto flex items-center gap-1.5">
				<Stamp tone={statusStyle('table', key).tone} dot={false}>
					{counts[key]}
					{statusStyle('table', key).label.toLowerCase()}
				</Stamp>
			</span>
		{/if}
	{/each}
</div>

{#if tables.isPending}
	<Plate><Skeleton rows={8} /></Plate>
{:else if allTables.length === 0}
	<Plate>
		<Empty
			icon={Armchair}
			title="No tables laid out yet"
			body="Add your tables once, drag them into the shape of the room, and the floor plan mirrors reality from then on."
		>
			{#snippet action()}
				<Button size="sm" onclick={openAdd}>Add the first table</Button>
			{/snippet}
		</Empty>
	</Plate>
{:else if view === 'list'}
	<Plate class="overflow-hidden">
		<PlateHead title="All tables" sub="Tap a row to act on that table" />
		<div class="overflow-x-auto">
			<table class="tbl">
				<thead>
					<tr>
						<th>Table</th>
						<th>State</th>
						<th class="tbl-num">Seats</th>
						<th class="hidden sm:table-cell">Room</th>
						<th style="width:120px"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each allTables as table (table.id)}
						{@const state = statusStyle('table', table.status)}
						<tr class={isLit($litKeys, `table:${table.id}`) ? 'row-lit' : ''}>
							<td class="u-mono text-ink font-[600]">{table.name}</td>
							<td><Stamp tone={state.tone}>{state.label}</Stamp></td>
							<td class="tbl-num u-num">{table.capacity}</td>
							<td class="text-ink-2 hidden text-[12px] sm:table-cell">
								{allFloors.find((floor) => floor.id === table.floorId)?.name ?? 'Unassigned'}
							</td>
							<td>
								<div class="flex justify-end gap-1">
									{#each ['AVAILABLE', 'OCCUPIED', 'CLEANING'] as option (option)}
										<button
											type="button"
											class="chip h-6 px-2 text-xs"
											aria-pressed={table.status === option}
											onclick={() => setStatus(table.id, option as TableStatus)}
										>
											{statusStyle('table', option).label}
										</button>
									{/each}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Plate>
{:else}
	<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
		<!-- ── the plan itself ───────────────────────────────────────────── -->
		<Plate flush class="overflow-hidden">
			{#if displayedSeats.arranged}
				<p class="border-line text-ink-2 border-b px-4 py-3 text-sm">
					Some saved positions overlap. Tables are spaced automatically here; drag them to save
					their room positions.
				</p>
			{/if}
			<div
				class="floor relative overflow-auto"
				style="min-height: {ROWS * CELL}px"
				ondragover={(event) => event.preventDefault()}
				ondrop={onDrop}
				role="application"
				aria-label="Floor plan — drag tables to arrange the room"
			>
				<div class="relative" style="width: {COLS * CELL}px; height: {ROWS * CELL}px">
					<!-- the grid the room is laid out on -->
					<div class="pointer-events-none absolute inset-0" aria-hidden="true">
						{#each { length: COLS + 1 } as _, i (i)}
							<span class="bg-line/60 absolute top-0 h-full w-px" style="left: {i * CELL}px"></span>
						{/each}
						{#each { length: ROWS + 1 } as _, i (i)}
							<span class="bg-line/60 absolute left-0 h-px w-full" style="top: {i * CELL}px"></span>
						{/each}
					</div>

					{#each shown as table (table.id)}
						{@const seat = seatOf(table)}
						{@const state = statusStyle('table', table.status)}
						<button
							type="button"
							draggable={table.isActive}
							ondragstart={(event) => onDragStart(table.id, event)}
							onclick={() => (selected = table.id)}
							style="left: {seat.x * CELL + 6}px; top: {seat.y * CELL + 6}px; width: {CELL -
								12}px; height: {CELL - 12}px"
							class="floor-table group absolute grid place-items-center rounded-md border-2 transition-[transform,box-shadow,border-color]
								{selected === table.id ? 'ring-brass ring-offset-ground z-20 ring-2 ring-offset-2' : ''}
								{state.tone === 'herb' ? 'border-herb-line bg-herb-wash' : ''}
								{state.tone === 'brass' ? 'border-brass bg-brass-wash' : ''}
								{state.tone === 'slate' ? 'border-slate bg-surface-2' : ''}
								{state.tone === 'amber' ? 'border-amber bg-amber-wash' : ''}
								{state.tone === 'neutral' ? 'border-line-strong bg-surface-3' : ''}
								{dragging === table.id
								? 'cursor-grabbing opacity-40'
								: table.isActive
									? 'hover:shadow-2 cursor-grab hover:-translate-y-0.5'
									: 'cursor-default'}"
							aria-label={`Table ${table.name}, ${state.label}, seats ${table.capacity}`}
						>
							<span class="u-mono text-ink text-sm font-[660]">{table.name}</span>
							<span class="text-ink-3 absolute bottom-1.5 flex items-center gap-1 text-[9.5px]">
								<Armchair size={9} strokeWidth={2} />
								<span class="u-num">{table.capacity}</span>
							</span>
							{#if isLit($litKeys, `table:${table.id}`)}
								<span
									class="bg-brass absolute -top-1.5 -right-1.5 size-2.5 rounded-full"
									style="animation: roms-pulse 1.6s ease-out infinite"
								></span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</Plate>

		<!-- ── the selected table's panel ────────────────────────────────── -->
		<div class="flex flex-col gap-4">
			<Plate>
				<PlateHead
					title={selectedTable ? selectedTable.name : 'Nothing selected'}
					sub={selectedTable
						? `${selectedTable.capacity} seats · ${statusStyle('table', selectedTable.status).label}`
						: 'Choose a table on the plan'}
				/>
				{#if selectedTable}
					{@const state = statusStyle('table', selectedTable.status)}
					<div class="space-y-3 p-4">
						<div class="flex items-center justify-between">
							<span class="u-label">State</span>
							<Stamp tone={state.tone}>{state.label}</Stamp>
						</div>
						<div class="flex items-center justify-between">
							<span class="u-label">Room</span>
							<span class="text-ink-2 text-[12px]">
								{allFloors.find((floor) => floor.id === selectedTable.floorId)?.name ??
									'Unassigned'}
							</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="u-label">Position</span>
							<span class="u-num text-ink-2 text-[12px]">
								{seatOf(selectedTable).x}, {seatOf(selectedTable).y}
							</span>
						</div>
					</div>

					<div class="perf-rule mx-4"></div>

					<div class="flex flex-wrap gap-1.5 p-4">
						{#each ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'OUT_OF_SERVICE'] as option (option)}
							<button
								type="button"
								class="chip h-7 px-2.5 text-xs"
								aria-pressed={selectedTable.status === option}
								onclick={() => setStatus(selectedTable.id, option as TableStatus)}
							>
								{statusStyle('table', option).label}
							</button>
						{/each}
					</div>

					<div class="border-line bg-surface-2 flex gap-1.5 border-t p-3">
						<Button
							size="sm"
							variant="secondary"
							class="flex-1"
							onclick={() => {
								mergeInto = [];
								mergeOpen = true;
							}}
						>
							<Merge size={14} />
							Join
						</Button>
						<Button size="sm" variant="secondary" class="flex-1" onclick={split}>
							<Split size={14} />
							Split
						</Button>
					</div>
				{:else}
					<Empty
						icon={MoveRight}
						title="Pick a table"
						body="Select any table on the plan to change its state, join it to others or split it apart."
					/>
				{/if}
			</Plate>

			<Plate>
				<PlateHead title="Reservations" sub="Booked ahead, soonest first" />
				{#if reservations.isPending}
					<Skeleton rows={3} />
				{:else if upcoming.length === 0}
					<Empty
						icon={CalendarClock}
						title="Nothing booked"
						body="Reservations taken at the host desk appear here with their party size and time."
					/>
				{:else}
					<ul class="divide-line divide-y">
						{#each upcoming as booking (booking.id)}
							<li class="flex items-start justify-between gap-3 px-4 py-2.5">
								<div class="min-w-0">
									<p class="text-ink text-sm font-[560]">
										{allTables.find((table) => table.id === booking.tableId)?.name ?? 'Any table'}
									</p>
									<p class="text-ink-3 mt-0.5 text-xs">
										{new Intl.DateTimeFormat('en-PK', {
											weekday: 'short',
											hour: 'numeric',
											minute: '2-digit'
										}).format(new Date(booking.reservedFrom))}
									</p>
								</div>
								<span class="u-num text-ink-2 shrink-0 text-[12px]">
									{booking.partySize} <span class="text-ink-3">pax</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</Plate>
		</div>
	</div>
{/if}

<!-- ── join tables ──────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={mergeOpen}
	onOpenChange={(value) => {
		if (!value) mergeOpen = false;
	}}
	title="Join tables"
	sub="The joined tables close and the party is served on the primary"
	width={480}
>
	<p class="text-ink-2 mb-3 text-sm">
		Everything will be served on
		<span class="u-mono text-ink font-[620]">{selectedTable?.name}</span>. Pick the tables to join
		to it.
	</p>
	<ul class="max-h-[280px] space-y-1 overflow-y-auto">
		{#each joinable as table (table.id)}
			<li>
				<button
					type="button"
					class="flex w-full items-center gap-2.5 rounded-sm border px-3 py-2 text-left transition-colors
							{mergeInto.includes(table.id) ? 'border-brass bg-brass-wash' : 'border-line hover:bg-surface-2'}"
					aria-pressed={mergeInto.includes(table.id)}
					onclick={() =>
						(mergeInto = mergeInto.includes(table.id)
							? mergeInto.filter((id) => id !== table.id)
							: [...mergeInto, table.id])}
				>
					<span
						class="grid size-[18px] shrink-0 place-items-center rounded-xs border
								{mergeInto.includes(table.id) ? 'border-brass bg-brass text-ground' : 'border-line-strong'}"
					>
						{#if mergeInto.includes(table.id)}<Check size={12} strokeWidth={3} />{/if}
					</span>
					<span class="u-mono text-ink flex-1 text-sm font-[600]">{table.name}</span>
					<Stamp tone={statusStyle('table', table.status).tone} dot={false}>
						{statusStyle('table', table.status).label}
					</Stamp>
				</button>
			</li>
		{:else}
			<li class="text-ink-3 py-4 text-center text-[12px]">
				There are no other tables to join on this floor.
			</li>
		{/each}
	</ul>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (mergeOpen = false)}>Cancel</Button>
		<Button loading={busy} disabled={mergeInto.length === 0} onclick={merge}>
			Join {mergeInto.length || ''} table{mergeInto.length === 1 ? '' : 's'}
		</Button>
	{/snippet}
</Modal>

<!-- ── add a table ──────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={addOpen}
	onOpenChange={(value) => {
		if (!value) addOpen = false;
	}}
	title="Add a table"
	sub="It lands on a free spot — drag it into place after"
	width={440}
>
	<FormSection title="Table details" description="Name the table and set its seating capacity.">
		<Field label="Name or number" for="tb-name" required>
			<Input id="tb-name" class=" u-mono" bind:value={form.name} placeholder="T12" />
		</Field>
		<Field label="Seats" for="tb-cap">
			<Input id="tb-cap" type="number" min="1" max="50" class=" u-num" bind:value={form.capacity} />
		</Field>
	</FormSection>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (addOpen = false)}>Cancel</Button>
		<Button loading={saving} disabled={!form.name.trim()} onclick={addTable}
			>Put it on the floor</Button
		>
	{/snippet}
</Modal>

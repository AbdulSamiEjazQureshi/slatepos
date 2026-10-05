<script lang="ts">
	import SelectField from '#lib/ui/select-field.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { api, type RecipeLineInput, type RecipeStatus } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import {
		formatDateTime,
		formatMoney,
		formatNumber,
		formatPercent,
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
	import FlaskConical from '@lucide/svelte/icons/flask-conical';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import X from '@lucide/svelte/icons/x';
	import Play from '@lucide/svelte/icons/play';
	import Check from '@lucide/svelte/icons/check';
	import Archive from '@lucide/svelte/icons/archive';

	const queryClient = useQueryClient();

	let tab = $state<'sheets' | 'batches'>('sheets');

	const recipes = createQuery(() => ({
		queryKey: ['recipes', 'list'],
		queryFn: () => api.listRecipes(),
		enabled: $authenticated
	}));

	const runs = createQuery(() => ({
		queryKey: ['recipes', 'runs'],
		queryFn: () => api.listProductionRuns(),
		enabled: $authenticated
	}));

	const products = createQuery(() => ({
		queryKey: ['catalog', 'products', 'recipes'],
		queryFn: () => api.listProducts({ pageSize: 100 }),
		enabled: $authenticated
	}));

	const branches = createQuery(() => ({
		queryKey: ['branches'],
		queryFn: () => api.listBranches(),
		enabled: $authenticated
	}));

	const rows = $derived(recipes.data ?? []);
	const allProducts = $derived(products.data?.items ?? []);
	const productById = $derived(new SvelteMap(allProducts.map((product) => [product.id, product])));

	const productName = (id: string) => productById.get(id)?.name ?? 'Unknown product';

	/**
	 * The row's own cost fields are what the sheet is judged on, so they are
	 * read straight off the list row — the price a component was costed at is
	 * the price recorded on it, not today's.
	 */
	const unitCost = (recipe: { theoreticalCost: string; yieldQuantity: string }) => {
		const yieldQty = Number(recipe.yieldQuantity) || 1;
		return Number(recipe.theoreticalCost) / yieldQty;
	};

	/** What one portion is sold for, if the output product still exists. */
	const sellPrice = (recipe: { productId: string }) => {
		const price = productById.get(recipe.productId)?.price;
		return price === undefined ? null : Number(price);
	};

	const margin = (recipe: {
		theoreticalCost: string;
		yieldQuantity: string;
		productId: string;
	}) => {
		const price = sellPrice(recipe);
		if (!price) return null;
		return (price - unitCost(recipe)) / price;
	};

	/** The colour a margin reads as, as a real CSS value — the palette names a
	 *  tone `neutral`, but there is no `--neutral` token to interpolate. */
	const marginTone = (value: number | null) =>
		value === null
			? 'var(--ink-3)'
			: value < 0.35
				? 'var(--brick)'
				: value < 0.5
					? 'var(--amber)'
					: 'var(--herb)';

	/** The lowest-margin sheets, worst first — the ones worth looking at today. */
	const thinnest = $derived(
		rows
			.filter((recipe) => recipe.status === 'ACTIVE' && margin(recipe) !== null)
			.sort((a, b) => (margin(a) ?? 1) - (margin(b) ?? 1))
			.slice(0, 4)
	);

	const live = $derived(rows.filter((recipe) => recipe.status === 'ACTIVE').length);
	const drafts = $derived(rows.filter((recipe) => recipe.status === 'DRAFT').length);

	const runRows = $derived(runs.data ?? []);
	const monthRuns = $derived(
		runRows.filter(
			(run) =>
				Boolean(run.producedAt) && Date.now() - new Date(run.producedAt!).getTime() < 30 * 864e5
		)
	);
	const monthCost = $derived(
		monthRuns.reduce((total, run) => total + Math.round(Number(run.actualCost ?? 0) * 100), 0) / 100
	);

	const recipeById = $derived(new SvelteMap(rows.map((recipe) => [recipe.id, recipe])));

	// ── the sheet ─────────────────────────────────────────────────────────
	let openId = $state<string | null>(null);

	const sheet = createQuery(() => ({
		queryKey: ['recipes', 'detail', openId],
		queryFn: () => api.getRecipe(openId as string),
		enabled: $authenticated && Boolean(openId)
	}));

	/** The line total the same way the API costs it: wastage scales quantity. */
	const lineTotal = (line: { quantity: string; wastageRate: string; unitCost: string }) =>
		Number(line.quantity) * (1 + Number(line.wastageRate)) * Number(line.unitCost);

	const sheetLines = $derived(sheet.data?.items ?? []);
	const sheetCost = $derived(sheetLines.reduce((total, line) => total + lineTotal(line), 0));

	const setStatus = async (id: string, status: RecipeStatus, name: string) => {
		try {
			await api.setRecipeStatus(id, status);
			await queryClient.invalidateQueries({ queryKey: ['recipes'] });
			toast.success(
				`${name} is ${status === 'ACTIVE' ? 'on the pass' : humanizeEnum(status).toLowerCase()}`
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change that recipe');
		}
	};

	// ── producing a batch ─────────────────────────────────────────────────
	let produceOpen = $state(false);
	let producing = $state(false);
	let produceTarget = $state<{ id: string; name: string } | null>(null);
	let produce = $state({ quantity: 1, branchId: '' });

	const openProduce = (id: string, name: string) => {
		produceTarget = { id, name };
		produce = { quantity: 1, branchId: $branchId ?? branches.data?.items[0]?.id ?? '' };
		produceOpen = true;
	};

	const confirmProduce = async () => {
		if (!produceTarget || produce.quantity < 1) return;
		producing = true;
		try {
			await api.produceRecipe(produceTarget.id, {
				quantity: produce.quantity,
				...(produce.branchId ? { branchId: produce.branchId } : {})
			});
			await queryClient.invalidateQueries({ queryKey: ['recipes'] });
			await queryClient.invalidateQueries({ queryKey: ['inventory'] });
			toast.success(`${produce.quantity} × ${produceTarget.name} produced`);
			produceOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not produce that batch');
		} finally {
			producing = false;
		}
	};

	// ── a new sheet ───────────────────────────────────────────────────────
	let formOpen = $state(false);
	let saving = $state(false);
	let form = $state({
		productId: '',
		name: '',
		yieldQuantity: '1',
		yieldUnit: 'portion',
		notes: '',
		percent: '0'
	});
	let lines = $state<
		{
			productId: string;
			name: string;
			quantity: string;
			unit: string;
			percent: string;
			unitCost: string;
		}[]
	>([]);
	let lineQuery = $state('');

	/** Keeps a sheet from listing the same ingredient twice. */
	const lineCandidates = $derived.by(() => {
		const needle = lineQuery.trim().toLowerCase();
		return allProducts
			.filter((product) => product.id !== form.productId)
			.filter((product) => !lines.some((line) => line.productId === product.id))
			.filter((product) => !needle || product.name.toLowerCase().includes(needle))
			.slice(0, 8);
	});

	const addLine = (product: (typeof allProducts)[number]) => {
		lines = [
			...lines,
			{
				productId: product.id,
				name: product.name,
				quantity: '1',
				unit: 'unit',
				percent: form.percent,
				// Seed from what the product was last costed at — it is a
				// starting point the chef can overwrite, not a live figure.
				unitCost: product.costPrice ?? '0'
			}
		];
		lineQuery = '';
	};

	const draftCost = $derived(
		lines.reduce(
			(total, line) =>
				total +
				Number(line.quantity || '0') *
					(1 + (Number(line.percent) || 0) / 100) *
					Number(line.unitCost || '0'),
			0
		)
	);
	const draftYield = $derived(Number(form.yieldQuantity) || 1);

	const openForm = () => {
		form = {
			productId: '',
			name: '',
			yieldQuantity: '1',
			yieldUnit: 'portion',
			notes: '',
			percent: '0'
		};
		lines = [];
		lineQuery = '';
		formOpen = true;
	};

	/** Picking the output product names the sheet after it. */
	const chooseOutput = (id: string) => {
		form.productId = id;
		const product = productById.get(id);
		if (product && !form.name.trim()) form.name = `${product.name} — house recipe`;
	};

	const save = async () => {
		if (!form.productId || !form.name.trim() || lines.length === 0) return;
		saving = true;
		try {
			const items: RecipeLineInput[] = lines.map((line) => ({
				componentProductId: line.productId,
				quantity: line.quantity || '1',
				unit: line.unit || 'unit',
				// A percent typed as "10" means ten per cent; the API wants "0.1".
				wastageRate: String((Number(line.percent) || 0) / 100),
				unitCost: line.unitCost || '0'
			}));
			await api.createRecipe({
				productId: form.productId,
				name: form.name.trim(),
				yieldQuantity: form.yieldQuantity || '1',
				yieldUnit: form.yieldUnit.trim() || 'unit',
				...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
				items
			});
			await queryClient.invalidateQueries({ queryKey: ['recipes'] });
			toast.success(`${form.name.trim()} drafted — activate it to produce`);
			formOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save that recipe');
		} finally {
			saving = false;
		}
	};

	const branchName = (id: string) =>
		branches.data?.items.find((row) => row.id === id)?.name ?? 'Branch';
</script>

<svelte:head><title>Recipes — ROMS</title></svelte:head>

<PageHead title="Recipes" sub="Manage recipes, ingredient costs and production.">
	{#snippet actions()}
		<Button size="sm" onclick={openForm}>
			<Plus size={14} />
			New recipe
		</Button>
	{/snippet}
</PageHead>

<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
	<Figure
		label="On the pass"
		value={recipes.isPending ? '—' : formatNumber(live)}
		sub="Active versions a batch can be run against"
	/>
	<Figure
		label="In draft"
		value={recipes.isPending ? '—' : formatNumber(drafts)}
		sub="Written but not yet produced"
	/>
	<Figure
		label="Batches this month"
		value={recipes.isPending ? '—' : formatNumber(monthRuns.length)}
		sub="Runs recorded in the last 30 days"
	/>
	<Figure
		label="Stock consumed"
		value={recipes.isPending ? '—' : formatMoney(monthCost)}
		sub="Costed against the last 30 days"
	/>
</div>

<div class="tabs mt-4">
	{#each [{ id: 'sheets', label: 'Recipe sheets' }, { id: 'batches', label: 'Production' }] as item (item.id)}
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

{#if tab === 'sheets'}
	{#if recipes.isPending}
		<Plate class="mt-3 overflow-hidden">
			<Skeleton rows={6} />
		</Plate>
	{:else if rows.length === 0}
		<Plate class="mt-3 overflow-hidden">
			<Empty
				icon={FlaskConical}
				title="No recipes yet"
				body="A recipe lists what goes into a dish and what each ingredient cost, so the price on the menu can be argued with numbers instead of instinct."
			>
				{#snippet action()}
					<Button size="sm" onclick={openForm}>Write the first recipe</Button>
				{/snippet}
			</Empty>
		</Plate>
	{:else}
		{#if thinnest.length > 0}
			<Plate class="mt-3 overflow-hidden">
				<PlateHead
					title="Thinnest margins"
					sub="Live dishes with the least left on them, per portion"
				/>
				<ul class="divide-line divide-y">
					{#each thinnest as recipe (recipe.id)}
						{@const share = margin(recipe) ?? 0}
						<li>
							<button
								type="button"
								class="hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150"
								onclick={() => (openId = recipe.id)}
							>
								<div class="min-w-0 flex-1">
									<p class="text-ink truncate text-sm font-[550]">{recipe.name}</p>
									<!-- A ruled cost scale, not a progress pill: one cell per
									     tenth of the plate's price, filled up to what the
									     ingredients eat. It reads as a printed gauge. -->
									<div class="mt-1.5 flex max-w-[220px] gap-px" aria-hidden="true">
										{#each Array(10) as _, i (i)}
											<span
												class="h-2 flex-1 rounded-[1px] transition-colors duration-200"
												style="background: {i < Math.round((1 - share) * 10)
													? 'var(--brick)'
													: 'var(--surface-3)'}"
											></span>
										{/each}
									</div>
								</div>
								<div class="shrink-0 text-right">
									<p class="u-num text-ink text-sm font-[600]">{formatPercent(share, 0)}</p>
									<p class="u-num text-ink-3 text-xs">
										{formatMoney(unitCost(recipe))} / portion
									</p>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			</Plate>
		{/if}

		<div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each rows as recipe (recipe.id)}
				{@const share = margin(recipe)}
				<article class="ticket anim-rise flex flex-col overflow-hidden">
					<div class="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2.5">
						<div class="min-w-0">
							<p class="text-ink truncate text-[13.5px] font-[600]">{recipe.name}</p>
							<p class="text-ink-3 mt-0.5 truncate text-xs">
								{productName(recipe.productId)}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-1.5">
							{#if recipe.isLocked}
								<!-- A word, not just a glyph with a title: hover is not
								     available on a tablet at the pass, and a lock icon
								     alone does not say what is frozen. -->
								<Stamp tone="neutral">Frozen</Stamp>
							{/if}
							<span class="chip-count u-mono">v{recipe.version}</span>
						</div>
					</div>

					<div class="perf-rule mx-4"></div>

					<div class="flex flex-1 flex-col px-4 pt-2.5 pb-3">
						<div class="flex items-baseline justify-between gap-3">
							<div>
								<p class="u-label">Cost per {recipe.yieldUnit}</p>
								<p class="u-num text-ink mt-1 text-[17px] font-[640]">
									{formatMoney(unitCost(recipe))}
								</p>
							</div>
							{#if share !== null}
								<div class="text-right">
									<p class="u-label">Left on it</p>
									<p class="u-num mt-1 text-[17px] font-[640]" style="color: {marginTone(share)}">
										{formatPercent(share, 0)}
									</p>
								</div>
							{/if}
						</div>

						{#if share !== null}
							<!-- What the plate eats of its own tag, as tenths. The eaten
							     share is legible from across the pass. -->
							<div class="mt-3">
								<div class="flex gap-px" aria-hidden="true">
									{#each Array(10) as _, i (i)}
										<span
											class="h-2.5 flex-1 rounded-[1px] transition-colors duration-200"
											style="background: {i < Math.round((1 - share) * 10)
												? 'var(--brick)'
												: 'var(--surface-3)'}"
										></span>
									{/each}
								</div>
								<p class="text-ink-3 mt-1.5 text-xs">
									sells {formatMoney(sellPrice(recipe) ?? 0)} · costs {formatMoney(
										unitCost(recipe)
									)}
								</p>
							</div>
						{/if}

						<p class="text-ink-3 mt-3 text-xs">
							makes {recipe.yieldQuantity}
							{recipe.yieldUnit}{#if recipe.yieldQuantity !== '1'}s{/if}
							{#if recipe.notes}
								· {recipe.notes}{/if}
						</p>
					</div>

					<div class="border-line flex items-center gap-1.5 border-t px-3 py-2">
						<Button size="sm" variant="ghost" onclick={() => (openId = recipe.id)}
							>Open sheet</Button
						>
						<div class="ml-auto flex items-center gap-1">
							{#if recipe.status === 'ACTIVE'}
								<Button
									size="sm"
									class="btn-sm"
									disabled={!$branchId}
									onclick={() => openProduce(recipe.id, recipe.name)}
								>
									<Play size={13} />
									Produce
								</Button>
							{:else if recipe.status === 'DRAFT'}
								<Button
									size="sm"
									class="btn-sm"
									onclick={() => setStatus(recipe.id, 'ACTIVE', recipe.name)}
								>
									<Check size={13} />
									Activate
								</Button>
							{:else}
								<Button
									size="sm"
									variant="ghost"
									class="btn-sm"
									onclick={() => setStatus(recipe.id, 'DRAFT', recipe.name)}
								>
									Restore
								</Button>
							{/if}
						</div>
					</div>
				</article>
			{/each}
		</div>
	{/if}
{:else}
	<Plate class="mt-3 overflow-hidden">
		<PlateHead title="Production" sub="Every batch run, newest first — 50 most recent" />

		{#if runs.isPending}
			<Skeleton rows={6} />
		{:else if runRows.length === 0}
			<Empty
				icon={FlaskConical}
				title="No batches run yet"
				body="Producing a recipe draws its ingredients out of stock and puts the finished product back in — one transaction, one run on this list."
			/>
		{:else}
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>Recipe</th>
							<th>Produced</th>
							<th>Branch</th>
							<th class="tbl-num">Batches</th>
							<th class="tbl-num">Stock cost</th>
							<th>When</th>
						</tr>
					</thead>
					<tbody>
						{#each runRows as run (run.id)}
							<tr>
								<td>
									<span class="text-ink text-sm font-[550]">
										{recipeById.get(run.recipeId)?.name ?? productName(run.outputProductId)}
									</span>
								</td>
								<td class="text-ink-2 text-[12px]">{productName(run.outputProductId)}</td>
								<td class="text-ink-3 text-[12px]">{branchName(run.branchId)}</td>
								<td class="tbl-num u-num text-sm">{formatNumber(run.quantity)}</td>
								<td class="tbl-num u-num text-sm">{formatMoney(run.actualCost)}</td>
								<td class="u-num text-ink-3 text-xs">{formatDateTime(run.producedAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Plate>
{/if}

<!-- ── the sheet ────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={Boolean(openId)}
	onOpenChange={(value) => {
		if (!value) openId = null;
	}}
	title={sheet.data?.name ?? 'Recipe sheet'}
	sub={sheet.data
		? `v${sheet.data.version} · makes ${sheet.data.yieldQuantity} ${sheet.data.yieldUnit}`
		: undefined}
	width={720}
>
	{#if sheet.isPending}
		<Skeleton rows={4} />
	{:else if sheet.data}
		<div class="flex flex-wrap items-center gap-2">
			<Stamp
				tone={sheet.data.status === 'ACTIVE'
					? 'herb'
					: sheet.data.status === 'DRAFT'
						? 'slate'
						: 'neutral'}
			>
				{humanizeEnum(sheet.data.status)}
			</Stamp>
			{#if sheet.data.isLocked}
				<span class="text-ink-3 text-xs">frozen — this version has been produced</span>
			{/if}
			<span class="text-ink-3 ml-auto text-xs">makes {productName(sheet.data.productId)}</span>
		</div>

		<div class="perf-rule my-4"></div>

		{#if sheetLines.length === 0}
			<p class="text-ink-3 py-4 text-sm">This sheet has no lines recorded against it.</p>
		{:else}
			<table class="tbl">
				<thead>
					<tr>
						<th>Ingredient</th>
						<th class="tbl-num">Quantity</th>
						<th class="tbl-num">Wastage</th>
						<th class="tbl-num">Unit cost</th>
						<th class="tbl-num">Line</th>
					</tr>
				</thead>
				<tbody>
					{#each sheetLines as line (line.id)}
						<tr>
							<td class="text-ink text-sm font-[550]">{productName(line.componentProductId)}</td>
							<td class="tbl-num u-num text-[12px]">
								{line.quantity}
								<span class="text-ink-3">{line.unit}</span>
							</td>
							<td class="tbl-num u-num text-ink-3 text-[12px]">
								{Number(line.wastageRate) > 0 ? formatPercent(Number(line.wastageRate), 1) : '—'}
							</td>
							<td class="tbl-num u-num text-[12px]">{formatMoney(line.unitCost)}</td>
							<td class="tbl-num u-num text-sm font-[600]">{formatMoney(lineTotal(line))}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<div
				class="border-line bg-surface-2 mt-4 flex items-end justify-between gap-4 rounded-sm border px-4 py-3"
			>
				<div>
					<p class="u-label">Batch cost</p>
					<p class="text-ink-3 mt-1 text-xs">Every line, wastage included</p>
				</div>
				<div class="text-right">
					<p class="u-figure text-ink">{formatMoney(sheetCost)}</p>
					<p class="u-num text-ink-3 mt-1 text-xs">
						{formatMoney(sheetCost / (Number(sheet.data.yieldQuantity) || 1))} per {sheet.data
							.yieldUnit}
					</p>
				</div>
			</div>

			{#if unitCost(sheet.data) !== sheetCost / (Number(sheet.data.yieldQuantity) || 1)}
				<p class="text-amber mt-3 text-xs">
					The lines no longer add up to the cost recorded when this version was written. Re-cost it
					as a new version rather than editing a frozen sheet.
				</p>
			{/if}
		{/if}
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (openId = null)}>Close</Button>
		{#if sheet.data && sheet.data.status === 'ACTIVE'}
			<Button
				disabled={!$branchId}
				onclick={() => {
					const id = sheet.data?.id;
					const name = sheet.data?.name;
					if (id && name) openProduce(id, name);
				}}
			>
				<Play size={14} />
				Produce a batch
			</Button>
		{:else if sheet.data}
			<Button onclick={() => setStatus(sheet.data!.id, 'ACTIVE', sheet.data!.name)}>
				<Check size={14} />
				Activate
			</Button>
		{/if}
	{/snippet}
</Modal>

<!-- ── produce ──────────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={produceOpen}
	onOpenChange={(value) => {
		if (!value) produceOpen = false;
	}}
	title="Produce {produceTarget?.name ?? ''}"
	sub="Ingredients leave stock and the finished product enters it, in one movement"
	width={460}
>
	<div class="form-grid">
		<Field
			label="Batches"
			hint="A batch is one run of the recipe as written."
			for="pd-qty"
			required
		>
			<Input id="pd-qty" type="number" min="1" class=" u-num" bind:value={produce.quantity} />
		</Field>
		<Field label="Branch" hint="Where the stock moves." for="pd-branch" required>
			<SelectField
				id="pd-branch"
				class=""
				bind:value={produce.branchId}
				items={[
					...(branches.data?.items ?? [])
						.map((branch) => [{ value: branch.id, label: `${branch.name}` }])
						.flat()
				]}
			/>
		</Field>
	</div>

	{#if !$branchId}
		<p class="text-amber mt-4 text-xs">
			No branch is selected in the workspace switcher, so this produces against today's default
			branch. Pick a branch at the top if that is not the right kitchen.
		</p>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (produceOpen = false)}>Cancel</Button>
		<Button loading={producing} disabled={produce.quantity < 1} onclick={confirmProduce}>
			<Play size={14} />
			Produce
		</Button>
	{/snippet}
</Modal>

<!-- ── write a sheet ────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={formOpen}
	onOpenChange={(value) => {
		if (!value) formOpen = false;
	}}
	title="New recipe"
	sub="Saved as a draft — nothing moves in stock until it is produced"
	width={680}
>
	<FormSection
		title="Recipe details"
		description="Choose the finished product and give the recipe a name."
		><Field label="Output product" hint="What this recipe makes." for="rc-output" required>
			<SelectField
				id="rc-output"
				class=""
				bind:value={form.productId}
				onValueChange={(event) => chooseOutput(event)}
				items={[
					{ value: '', label: `Choose a product` },
					...allProducts.map((product) => [{ value: product.id, label: `${product.name}` }]).flat()
				]}
			/>
		</Field><Field label="Sheet name" for="rc-name" required>
			<Input id="rc-name" class="" bind:value={form.name} placeholder="Lamb yakhni — house" />
		</Field></FormSection
	>
	<FormSection title="Batch output" description="Set the yield and wastage for one production run."
		><Field label="Yield" hint="How much one batch makes." for="rc-yield" required>
			<div class="flex gap-2">
				<Input id="rc-yield" class=" u-num" bind:value={form.yieldQuantity} inputmode="decimal" />
				<Input class="" bind:value={form.yieldUnit} placeholder="portion" aria-label="Yield unit" />
			</div>
		</Field><Field
			label="Default wastage"
			hint="Applied to each ingredient as it is added."
			for="rc-waste"
		>
			<div class="field-shell">
				<Input id="rc-waste" class=" u-num" bind:value={form.percent} inputmode="decimal" />
				<span class="text-ink-3 pr-3 text-[12px]">%</span>
			</div>
		</Field></FormSection
	>

	<Field label="Notes" for="rc-notes" class="mt-4">
		<Input
			id="rc-notes"
			class=""
			bind:value={form.notes}
			placeholder="Cooked on the flat top, never the range"
		/>
	</Field>

	<div class="perf-rule my-4"></div>

	<Field
		label="Ingredients"
		hint="Search the catalogue; the cost is seeded from what the product was last costed at."
		for="rc-line"
	>
		<Input id="rc-line" class="" bind:value={lineQuery} placeholder="Type to find an ingredient" />
	</Field>

	{#if lineQuery.trim() && lineCandidates.length > 0}
		<ul class="divide-line border-line mt-2 divide-y rounded-md border">
			{#each lineCandidates as product (product.id)}
				<li>
					<button
						type="button"
						class="hover:bg-surface-2 flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150"
						onclick={() => addLine(product)}
					>
						<span class="text-ink min-w-0 flex-1 truncate text-sm">{product.name}</span>
						<span class="u-num text-ink-3 shrink-0 text-xs">
							cost {formatMoney(product.costPrice ?? '0')}
						</span>
						<Plus size={13} class="text-ink-3 shrink-0" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if lines.length > 0}
		<ul class="mt-3 space-y-1.5">
			{#each lines as line, i (line.productId)}
				<li class="border-line flex flex-wrap items-center gap-2 rounded-sm border px-3 py-2">
					<span class="text-ink min-w-0 flex-1 truncate text-sm">{line.name}</span>

					<div class="flex items-center gap-1">
						<button
							type="button"
							class="btn btn-ghost btn-icon btn-sm"
							aria-label="One less {line.name}"
							onclick={() =>
								(lines[i].quantity = String(Math.max(0.0001, Number(line.quantity) - 1)))}
						>
							<Minus size={13} />
						</button>
						<Input
							class=" u-num h-7 w-[68px] text-center text-[12px]"
							aria-label="Quantity of {line.name}"
							bind:value={line.quantity}
							inputmode="decimal"
						/>
						<button
							type="button"
							class="btn btn-ghost btn-icon btn-sm"
							aria-label="One more {line.name}"
							onclick={() => (lines[i].quantity = String(Number(line.quantity) + 1))}
						>
							<Plus size={13} />
						</button>
					</div>

					<Input
						class=" h-7 w-[76px] text-center text-[12px]"
						aria-label="Unit for {line.name}"
						bind:value={line.unit}
					/>

					<div class="field-shell h-7 w-[86px]">
						<Input
							class=" u-num h-7 text-[12px]"
							aria-label="Wastage percent for {line.name}"
							bind:value={line.percent}
							inputmode="decimal"
						/>
						<span class="text-ink-3 pr-2 text-xs">%</span>
					</div>

					<div class="field-shell h-7 w-[104px]">
						<Input
							class=" u-num h-7 text-[12px]"
							aria-label="Unit cost for {line.name}"
							bind:value={line.unitCost}
							inputmode="decimal"
						/>
						<span class="text-ink-3 pr-2 text-xs">PKR</span>
					</div>

					<span class="u-num text-ink w-[84px] shrink-0 text-right text-[12px] font-[600]">
						{formatMoney(
							Number(line.quantity || '0') *
								(1 + (Number(line.percent) || 0) / 100) *
								Number(line.unitCost || '0')
						)}
					</span>

					<button
						type="button"
						class="btn btn-ghost btn-icon btn-sm text-ink-3 hover:text-brick"
						aria-label="Remove {line.name}"
						onclick={() => (lines = lines.filter((item) => item.productId !== line.productId))}
					>
						<X size={13} />
					</button>
				</li>
			{/each}
		</ul>

		<div
			class="border-line bg-surface-2 mt-3 flex items-end justify-between gap-4 rounded-sm border px-4 py-3"
		>
			<div>
				<p class="u-label">Batch cost so far</p>
				<p class="text-ink-3 mt-1 text-xs">
					{lines.length} ingredient{lines.length === 1 ? '' : 's'} · wastage included
				</p>
			</div>
			<div class="text-right">
				<p class="u-figure text-ink">{formatMoney(draftCost)}</p>
				<p class="u-num text-ink-3 mt-1 text-xs">
					{formatMoney(draftCost / draftYield)} per {form.yieldUnit || 'unit'}
				</p>
			</div>
		</div>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (formOpen = false)}>Cancel</Button>
		<Button
			loading={saving}
			disabled={!form.productId || !form.name.trim() || lines.length === 0}
			onclick={save}
		>
			<Archive size={14} />
			Save as draft
		</Button>
	{/snippet}
</Modal>

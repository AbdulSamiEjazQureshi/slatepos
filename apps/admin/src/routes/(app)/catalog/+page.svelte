<script lang="ts">
	import * as Dropdown from '#lib/components/ui/dropdown-menu/index.js';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import SelectField from '#lib/ui/select-field.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import { formatMoney, formatNumber, humanizeEnum, titleCase } from '#lib/format';
	import type { ProductDto } from '#lib/api';
	import PageHead from '#lib/ui/page-head.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import Button from '#lib/ui/button.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Modal from '#lib/ui/modal.svelte';
	import Field from '#lib/ui/field.svelte';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Archive from '@lucide/svelte/icons/archive';
	import Layers from '@lucide/svelte/icons/layers';
	import Boxes from '@lucide/svelte/icons/boxes';
	import Check from '@lucide/svelte/icons/check';

	const queryClient = useQueryClient();

	let tab = $state<'menu' | 'categories'>('menu');
	let query = $state('');
	let categoryId = $state<string | null>(null);
	let statusFilter = $state<'ALL' | 'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ALL');

	const products = createQuery(() => ({
		queryKey: ['catalog', 'products', $branchId, statusFilter],
		queryFn: () =>
			api.listProducts({
				pageSize: 200,
				...(statusFilter === 'ALL' ? {} : { status: statusFilter })
			}),
		enabled: $authenticated
	}));

	const categories = createQuery(() => ({
		queryKey: ['catalog', 'categories'],
		queryFn: () => api.categories(),
		enabled: $authenticated
	}));

	const rows = $derived.by(() => {
		let items = products.data?.items ?? [];
		if (categoryId) items = items.filter((product) => product.categoryId === categoryId);
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter(
			(product) =>
				product.name.toLowerCase().includes(needle) ||
				product.sku?.toLowerCase().includes(needle) ||
				product.aliases.some((alias) => alias.toLowerCase().includes(needle))
		);
	});

	const nameOfCategory = (id: string | null) =>
		(id && categories.data?.items?.find((category) => category.id === id)?.name) || 'Uncategorised';

	const stats = $derived.by(() => {
		const items = products.data?.items ?? [];
		return {
			total: items.length,
			active: items.filter((product) => product.status === 'ACTIVE').length,
			tracked: items.filter((product) => product.trackInventory).length,
			modifiers: items.filter((product) => product.modifierGroups.length > 0).length
		};
	});

	// ── create / edit a product ───────────────────────────────────────────
	let editingId = $state<string | null>(null);
	let editorOpen = $state(false);
	let saving = $state(false);

	let form = $state({
		name: '',
		price: '',
		costPrice: '',
		categoryId: '',
		sku: '',
		description: '',
		taxRate: '0',
		trackInventory: false,
		isAvailable: true,
		status: 'ACTIVE' as 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
	});

	/** A rate typed as "5" means five percent; the API stores the fraction 0.05. */
	const rateFromPercent = (percent: string) => {
		const n = Number(percent);
		return Number.isFinite(n) ? String(Math.max(0, n) / 100) : '0';
	};
	const percentFromRate = (rate: string) => {
		const n = Number(rate);
		return Number.isFinite(n) ? String(Math.round(n * 10000) / 100) : '0';
	};
	let taxPercent = $state('0');

	const openCreate = () => {
		editingId = null;
		form = {
			name: '',
			price: '',
			costPrice: '',
			categoryId: categoryId ?? '',
			sku: '',
			description: '',
			taxRate: '0',
			trackInventory: false,
			isAvailable: true,
			status: 'ACTIVE'
		};
		taxPercent = '0';
		editorOpen = true;
	};

	const openEdit = (product: ProductDto) => {
		editingId = product.id;
		form = {
			name: product.name,
			price: product.price,
			costPrice: product.costPrice ?? '',
			categoryId: product.categoryId ?? '',
			sku: product.sku ?? '',
			description: product.description ?? '',
			taxRate: product.taxRate,
			trackInventory: product.trackInventory,
			isAvailable: product.isAvailable,
			status: product.status
		};
		taxPercent = percentFromRate(product.taxRate);
		editorOpen = true;
	};

	const save = async () => {
		saving = true;
		const body = {
			name: form.name.trim(),
			price: form.price || '0',
			...(form.costPrice ? { costPrice: form.costPrice } : {}),
			...(form.categoryId ? { categoryId: form.categoryId } : { categoryId: null }),
			...(form.sku ? { sku: form.sku } : {}),
			...(form.description ? { description: form.description } : {}),
			taxRate: rateFromPercent(taxPercent),
			trackInventory: form.trackInventory,
			isAvailable: form.isAvailable,
			status: form.status
		};
		try {
			if (editingId) await api.updateProduct(editingId, body);
			else await api.createProduct(body);
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
			toast.success(editingId ? `${body.name} updated` : `${body.name} is on the menu`);
			editorOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save the product');
		} finally {
			saving = false;
		}
	};

	const archive = async (product: ProductDto) => {
		try {
			await api.updateProduct(product.id, { status: 'ARCHIVED', isAvailable: false });
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
			toast.success(`${product.name} archived`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not archive the product');
		}
	};

	const toggleAvailable = async (product: ProductDto) => {
		try {
			await api.updateProduct(product.id, { isAvailable: !product.isAvailable });
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change availability');
		}
	};

	// ── categories ────────────────────────────────────────────────────────
	let categoryOpen = $state(false);
	let newCategoryName = $state('');
	let categorySort = $state(0);
	let savingCategory = $state(false);

	const addCategory = async () => {
		savingCategory = true;
		try {
			await api.createCategory({
				name: newCategoryName.trim(),
				sortOrder: categorySort
			});
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
			toast.success(`${newCategoryName} added`);
			newCategoryName = '';
			categorySort = 0;
			categoryOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not add the category');
		} finally {
			savingCategory = false;
		}
	};

	const archiveCategory = async (id: string, name: string) => {
		try {
			await api.deleteCategory(id);
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
			toast.success(`${name} retired`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not retire the category');
		}
	};

	/** The product's margin, drawn as a share of its price. */
	const margin = (product: ProductDto): number | null => {
		const price = Number(product.price);
		const cost = Number(product.costPrice ?? '0');
		if (!price || !product.costPrice) return null;
		return Math.round(((price - cost) / price) * 100);
	};
</script>

<svelte:head><title>Catalog — ROMS</title></svelte:head>

<PageHead
	title="Catalog"
	sub={`${formatNumber(stats.total)} products · ${stats.active} on sale · ${stats.modifiers} with choices`}
>
	{#snippet actions()}
		<Button size="sm" onclick={openCreate}>
			<Plus size={14} />
			New product
		</Button>
	{/snippet}
</PageHead>

<div class="mb-3 flex flex-wrap items-center gap-1.5">
	<div class="border-line flex rounded-sm border p-0.5">
		<button
			type="button"
			class="chip h-7 rounded-xs px-2.5 text-xs"
			aria-pressed={tab === 'menu'}
			onclick={() => (tab = 'menu')}
		>
			Menu
		</button>
		<button
			type="button"
			class="chip h-7 rounded-xs px-2.5 text-xs"
			aria-pressed={tab === 'categories'}
			onclick={() => (tab = 'categories')}
		>
			Categories
			<span class="chip-count">{categories.data?.items?.length ?? 0}</span>
		</button>
	</div>

	{#if tab === 'menu'}
		<span class="bg-line mx-1 h-5 w-px"></span>
		<button
			type="button"
			class="chip"
			aria-pressed={categoryId === null}
			onclick={() => (categoryId = null)}
		>
			Everything
		</button>
		{#each categories.data?.items ?? [] as category (category.id)}
			<button
				type="button"
				class="chip"
				aria-pressed={categoryId === category.id}
				onclick={() => (categoryId = category.id)}
			>
				{category.name}
			</button>
		{/each}

		<span class="ml-auto flex items-center gap-1.5">
			{#each ['ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED'] as key (key)}
				<button
					type="button"
					class="chip h-7 px-2.5 text-xs"
					aria-pressed={statusFilter === key}
					onclick={() => (statusFilter = key as typeof statusFilter)}
				>
					{key === 'ALL' ? 'Any state' : titleCase(key)}
				</button>
			{/each}
		</span>
	{/if}
</div>

{#if tab === 'categories'}
	<Plate class="overflow-hidden">
		<PlateHead title="Categories" sub="Organize products on your menu.">
			{#snippet actions()}
				<Button size="sm" variant="outline" onclick={() => (categoryOpen = true)}>
					<Plus size={14} />
					Add
				</Button>
			{/snippet}
		</PlateHead>

		{#if categories.isPending}
			<Skeleton rows={5} />
		{:else if (categories.data?.items ?? []).length === 0}
			<Empty
				icon={Layers}
				title="No categories yet"
				body="Categories group the menu on the POS and in reports. Add the first one and products can be filed under it."
			>
				{#snippet action()}
					<Button size="sm" onclick={() => (categoryOpen = true)}>Add a category</Button>
				{/snippet}
			</Empty>
		{:else}
			<ul class="divide-line divide-y">
				{#each categories.data?.items ?? [] as category (category.id)}
					{@const count = (products.data?.items ?? []).filter(
						(product) => product.categoryId === category.id
					).length}
					<li class="flex items-center gap-3 px-4 py-2.5">
						<span class="u-num text-ink-3 w-6 shrink-0 text-xs">
							{String(category.sortOrder).padStart(2, '0')}
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm font-[560]">{category.name}</p>
							{#if category.description}
								<p class="text-ink-3 truncate text-xs">{category.description}</p>
							{/if}
						</div>
						<span class="u-num text-ink-3 shrink-0 text-xs">
							{count} product{count === 1 ? '' : 's'}
						</span>
						<Stamp tone={category.isActive ? 'herb' : 'neutral'} dot={false}>
							{category.isActive ? 'Active' : 'Retired'}
						</Stamp>
						{#if category.isActive}
							<button
								type="button"
								class="btn btn-ghost btn-icon btn-sm text-ink-3 hover:text-brick"
								aria-label="Retire {category.name}"
								onclick={() => archiveCategory(category.id, category.name)}
							>
								<Archive size={14} />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Plate>
{:else}
	<Plate class="overflow-hidden">
		<PlateHead
			title="Products"
			sub={categoryId ? nameOfCategory(categoryId) : 'The whole menu, cheapest to dearest'}
		>
			{#snippet actions()}
				<div class="field-shell w-[220px] max-w-[46vw]">
					<Search />
					<Input class="" bind:value={query} placeholder="Name, SKU or alias…" />
				</div>
			{/snippet}
		</PlateHead>

		{#if products.isPending}
			<Skeleton rows={8} />
		{:else if rows.length === 0}
			<Empty
				icon={BookOpen}
				title={query ? 'Nothing matches that' : 'No products here'}
				body={query
					? 'Try part of a name, a SKU, or one of the product’s aliases.'
					: 'Add a product and it becomes sellable at the POS straight away.'}
			>
				{#snippet action()}
					<Button size="sm" onclick={openCreate}>Add a product</Button>
				{/snippet}
			</Empty>
		{:else}
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>Product</th>
							<th class="hidden sm:table-cell">Category</th>
							<th class="tbl-num">Price</th>
							<th class="tbl-num">Margin</th>
							<th class="hidden lg:table-cell">Choices</th>
							<th>State</th>
							<th style="width:96px"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each rows as product (product.id)}
							{@const state =
								product.status === 'ACTIVE'
									? 'herb'
									: product.status === 'DRAFT'
										? 'amber'
										: 'neutral'}
							{@const m = margin(product)}
							<tr class="group">
								<td>
									<div class="flex items-center gap-2.5">
										<span
											class="border-line bg-surface-2 grid size-8 shrink-0 place-items-center overflow-hidden rounded-sm border"
										>
											{#if product.imageUrl}
												<img
													src={product.imageUrl}
													alt=""
													class="size-full object-cover"
													loading="lazy"
												/>
											{:else}
												<Boxes size={14} class="text-ink-3" strokeWidth={1.7} />
											{/if}
										</span>
										<div class="min-w-0">
											<p class="text-ink truncate text-sm font-[560]">{product.name}</p>
											<p class="text-ink-3 truncate text-xs">
												{product.sku || product.variants.length
													? (product.sku ?? `${product.variants.length} variants`)
													: 'No SKU'}
												{#if product.trackInventory}
													<span class="text-brass-ink">· stock-tracked</span>
												{/if}
											</p>
										</div>
									</div>
								</td>
								<td class="text-ink-2 hidden text-[12px] sm:table-cell">
									{nameOfCategory(product.categoryId)}
								</td>
								<td class="tbl-num u-num text-ink text-sm font-[600]">
									{formatMoney(product.price)}
								</td>
								<td class="tbl-num">
									{#if m === null}
										<span class="text-ink-3 text-xs">—</span>
									{:else}
										<span
											class="u-num text-[12px] {m < 20
												? 'text-brick'
												: m < 40
													? 'text-amber'
													: 'text-herb'}"
										>
											{m}%
										</span>
									{/if}
								</td>
								<td class="hidden lg:table-cell">
									{#if product.modifierGroups.length}
										<span class="text-ink-2 text-xs">
											{product.modifierGroups.length} group{product.modifierGroups.length === 1
												? ''
												: 's'}
										</span>
									{:else}
										<span class="text-ink-3 text-xs">—</span>
									{/if}
								</td>
								<td>
									<div class="flex flex-col gap-1">
										<Stamp tone={state} dot={false}>
											{humanizeEnum(product.status)}
										</Stamp>
										{#if !product.isAvailable}
											<span class="text-ink-3 text-[10px]">off the menu</span>
										{/if}
									</div>
								</td>
								<td>
									<div class="flex justify-end">
										<Dropdown.Root
											><Dropdown.Trigger
												class="text-muted-foreground hover:bg-muted grid size-8 place-items-center rounded-md"
												aria-label={`Actions for ${product.name}`}
												><Ellipsis size={16} /></Dropdown.Trigger
											><Dropdown.Content align="end"
												><Dropdown.Item onclick={() => openEdit(product)}
													><Pencil />Edit product</Dropdown.Item
												><Dropdown.Item onclick={() => toggleAvailable(product)}
													>{product.isAvailable
														? 'Mark unavailable'
														: 'Mark available'}</Dropdown.Item
												>{#if product.status !== 'ARCHIVED'}<Dropdown.Separator /><Dropdown.Item
														variant="destructive"
														onclick={() => archive(product)}
														><Archive />Archive product</Dropdown.Item
													>{/if}</Dropdown.Content
											></Dropdown.Root
										>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Plate>
{/if}

<!-- ── product editor ───────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={editorOpen}
	onOpenChange={(value) => {
		if (!value) editorOpen = false;
	}}
	title={editingId ? 'Edit product' : 'New product'}
	sub={editingId
		? 'Changes apply to the next ticket, not ones already rung'
		: 'It goes live the moment you save'}
	width={620}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="Name" for="p-name" required class="sm:col-span-2">
			<Input id="p-name" class="" bind:value={form.name} placeholder="Chicken Karahi" />
		</Field>
		<Field label="Price" for="p-price" required>
			<div class="field-shell">
				<Input
					id="p-price"
					class=" u-num"
					bind:value={form.price}
					placeholder="0.00"
					inputmode="decimal"
				/>
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>
		<Field label="Cost" hint="What it costs you. Drives the margin." for="p-cost">
			<div class="field-shell">
				<Input
					id="p-cost"
					class=" u-num"
					bind:value={form.costPrice}
					placeholder="0.00"
					inputmode="decimal"
				/>
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>
		<Field label="Category" for="p-cat">
			<SelectField
				id="p-cat"
				class=""
				bind:value={form.categoryId}
				items={[
					{ value: '', label: `Uncategorised` },
					...(categories.data?.items ?? [])
						.map((category) => [{ value: category.id, label: `${category.name}` }])
						.flat()
				]}
			/>
		</Field>
		<Field label="Tax rate" hint="Percent added on top of the price." for="p-tax">
			<div class="field-shell">
				<Input
					id="p-tax"
					class=" u-num"
					bind:value={taxPercent}
					placeholder="0"
					inputmode="decimal"
				/>
				<span class="text-ink-3 pr-3 text-[12px]">%</span>
			</div>
		</Field>
		<Field
			label="SKU"
			hint="Optional code for the kitchen printer."
			for="p-sku"
			class="sm:col-span-2"
		>
			<Input id="p-sku" class=" u-mono" bind:value={form.sku} placeholder="MAIN-014" />
		</Field>
		<Field label="Description" for="p-desc" class="sm:col-span-2">
			<Textarea
				id="p-desc"
				class=" min-h-[64px] resize-y"
				bind:value={form.description}
				placeholder="What it is, for the menu and the website"
			></Textarea>
		</Field>
		<Field label="State" for="p-status" class="sm:col-span-2">
			<div class="flex flex-wrap gap-1.5">
				{#each ['DRAFT', 'ACTIVE', 'ARCHIVED'] as option (option)}
					<button
						type="button"
						class="chip h-7 px-2.5 text-xs"
						aria-pressed={form.status === option}
						onclick={() => (form.status = option as typeof form.status)}
					>
						{titleCase(option)}
					</button>
				{/each}
			</div>
		</Field>
	</div>

	<div class="perf-rule mt-4"></div>

	<div class="mt-3 flex flex-wrap gap-2">
		<button
			type="button"
			class="flex items-center gap-2 rounded-sm border px-3 py-2 text-left transition-colors
					{form.isAvailable ? 'border-brass bg-brass-wash' : 'border-line hover:bg-surface-2'}"
			aria-pressed={form.isAvailable}
			onclick={() => (form.isAvailable = !form.isAvailable)}
		>
			<span
				class="grid size-[18px] shrink-0 place-items-center rounded-xs border
						{form.isAvailable ? 'border-brass bg-brass text-ground' : 'border-line-strong'}"
			>
				{#if form.isAvailable}<Check size={12} strokeWidth={3} />{/if}
			</span>
			<span class="text-ink-2 text-[12px]">On the menu today</span>
		</button>
		<button
			type="button"
			class="flex items-center gap-2 rounded-sm border px-3 py-2 text-left transition-colors
					{form.trackInventory ? 'border-brass bg-brass-wash' : 'border-line hover:bg-surface-2'}"
			aria-pressed={form.trackInventory}
			onclick={() => (form.trackInventory = !form.trackInventory)}
		>
			<span
				class="grid size-[18px] shrink-0 place-items-center rounded-xs border
						{form.trackInventory ? 'border-brass bg-brass text-ground' : 'border-line-strong'}"
			>
				{#if form.trackInventory}<Check size={12} strokeWidth={3} />{/if}
			</span>
			<span class="text-ink-2 text-[12px]">Track stock</span>
		</button>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (editorOpen = false)}>Cancel</Button>
		<Button loading={saving} disabled={!form.name.trim() || !form.price} onclick={save}>
			{editingId ? 'Save changes' : 'Add to the menu'}
		</Button>
	{/snippet}
</Modal>

<!-- ── new category ─────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={categoryOpen}
	onOpenChange={(value) => {
		if (!value) categoryOpen = false;
	}}
	title="Add a category"
	sub="Groups the menu and the reports"
	width={420}
>
	<div class="grid gap-4">
		<Field label="Name" for="c-name" required>
			<Input id="c-name" class="" bind:value={newCategoryName} placeholder="Grill" />
		</Field>
		<Field label="Sort order" hint="Lower numbers sit first on the POS." for="c-sort">
			<Input id="c-sort" type="number" min="0" class=" u-num" bind:value={categorySort} />
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (categoryOpen = false)}>Cancel</Button>
		<Button loading={savingCategory} disabled={!newCategoryName.trim()} onclick={addCategory}
			>Add</Button
		>
	{/snippet}
</Modal>

<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { branchSwitchLocked } from '#lib/shell-store';
	import { ApiError } from '#lib/api/client';
	import { browser } from '$app/env';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import { PosCheckout } from '#lib/pos-checkout';
	import type { OrderDto } from '@roms/contracts/orders';
	import type { CreatePaymentInput } from '@roms/contracts/payments';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api';
	import { PosCart, lineTotalMinor, type CartModifier } from '#lib/pos-cart.svelte';
	import { authenticated, branchId, currentUser } from '#lib/session';
	import { onRealtime } from '#lib/realtime';
	import { PAYMENT_METHOD_LABEL, ORDER_TYPE_LABEL } from '#lib/status';
	import { formatMoney } from '#lib/format';
	import Utensils from '@lucide/svelte/icons/utensils';
	import Button from '#lib/ui/button.svelte';
	import SelectField from '#lib/ui/select-field.svelte';
	import * as Dropdown from '#lib/components/ui/dropdown-menu/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import Modal from '#lib/ui/modal.svelte';
	import Field from '#lib/ui/field.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import List from '@lucide/svelte/icons/list';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import X from '@lucide/svelte/icons/x';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Percent from '@lucide/svelte/icons/percent';
	import Banknote from '@lucide/svelte/icons/banknote';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Check from '@lucide/svelte/icons/check';

	const demoPhotos: Record<string, string> = {
		'Loaded Fries': '/demo-menu/fries.jpg',
		'Chicken Burger': '/demo-menu/burger.jpg',
		'Beef Steak': '/demo-menu/steak.jpg',
		'Cola 500ml': '/demo-menu/cola.jpg',
		'Chocolate Lava Cake': '/demo-menu/cake.jpg'
	};
	const queryClient = useQueryClient();

	let query = $state('');
	let activeCategory = $state<string | null>(null);
	let view = $state<'grid' | 'list'>('grid');
	let mobileTicket = $state(false);
	const mobileViewport = new MediaQuery('(max-width: 1099px)');
	let sort = $state('menu');
	let menuPage = $state(1);
	const photoFor = (name: string, imageUrl?: string | null) =>
		imageUrl ??
		($currentUser?.tenantSlug === 'demo' ? demoPhotos[name.split(' · ')[0]] : undefined);

	const catalog = createQuery(() => ({
		queryKey: ['products', 'pos', $branchId, query.trim(), activeCategory, sort, menuPage],
		queryFn: () =>
			api.listProducts({
				pageSize: 24,
				page: menuPage,
				sort: sort === 'name' ? 'name' : sort.startsWith('price') ? 'price' : 'createdAt',
				order: sort === 'name' || sort === 'price-asc' ? 'asc' : 'desc',
				...(query.trim() ? { q: query.trim() } : {}),
				...(activeCategory ? { categoryId: activeCategory } : {})
			}),
		enabled: $authenticated
	}));

	const categories = createQuery(() => ({
		queryKey: ['categories'],
		queryFn: () => api.categories(),
		enabled: $authenticated
	}));

	const tables = createQuery(() => ({
		queryKey: ['tables', $branchId],
		queryFn: () => api.listTables({ branchId: $branchId ?? undefined }),
		enabled: $authenticated
	}));

	const customers = createQuery(() => ({
		queryKey: ['customers', 'pos'],
		queryFn: () => api.listCustomers({ pageSize: 100 }),
		enabled: $authenticated
	}));

	// The catalogue is hot — a new dish must appear on every till immediately.
	onMount(() => {
		const dispose = onRealtime((event) => {
			if (event.type.startsWith('order.')) {
				queryClient.invalidateQueries({ queryKey: ['orders'] });
			}
		});
		return dispose;
	});

	const cart = new PosCart();

	let payOpen = $state(false);
	type HeldTicket = {
		id: string;
		at: string;
		branch: string | null;
		lines: typeof cart.lines;
		type: typeof cart.orderType;
		tableId: string | null;
		customerId: string | null;
		notes: string;
		discount: typeof cart.discount;
		tip: number;
	};
	let heldOpen = $state(false);
	let notesOpen = $state(false);
	let discountOpen = $state(false);
	let discountType = $state<'PERCENT' | 'FIXED'>('PERCENT');
	let discountValue = $state('');
	const holdKey = $derived(`roms.held.${$currentUser?.tenantId}.${$currentUser?.id}.${$branchId}`);
	let held: HeldTicket[] = $derived.by(() => {
		if (!browser) return [];
		try {
			const value = JSON.parse(sessionStorage.getItem(holdKey) ?? '[]');
			return Array.isArray(value) ? value : [];
		} catch {
			return [];
		}
	});
	const persistHeld = () => {
		try {
			sessionStorage.setItem(holdKey, JSON.stringify(held));
		} catch {
			toast.error('Held tickets could not be saved on this device');
		}
	};
	const hold = () => {
		if (cart.isEmpty || locked) return;
		held = [
			...held,
			{
				id: crypto.randomUUID(),
				at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
				branch: $branchId,
				lines: $state.snapshot(cart.lines),
				type: cart.orderType,
				tableId: cart.tableId,
				customerId: cart.customerId,
				notes: cart.notes,
				discount: $state.snapshot(cart.discount),
				tip: cart.tipMinor
			}
		];
		persistHeld();
		reset();
		toast.success('Ticket held on this terminal');
	};
	const resume = (id: string) => {
		if (!cart.isEmpty) {
			toast.error('Hold or clear the current ticket first');
			return;
		}
		const ticket = held.find((item) => item.id === id);
		if (!ticket || ticket.branch !== $branchId) return;
		cart.lines = ticket.lines;
		cart.orderType = ticket.type;
		cart.tableId = ticket.tableId;
		cart.customerId = ticket.customerId;
		cart.notes = ticket.notes;
		cart.discount = ticket.discount;
		cart.tipMinor = ticket.tip;
		held = held.filter((item) => item.id !== id);
		persistHeld();
		heldOpen = false;
	};
	const applyDiscount = () => {
		const value = Number(discountValue);
		if (!Number.isFinite(value) || value < 0 || (discountType === 'PERCENT' && value > 100)) {
			toast.error('Enter a valid discount');
			return;
		}
		cart.discount = value
			? {
					type: discountType,
					value: discountType === 'PERCENT' ? (value / 100).toFixed(4) : value.toFixed(2)
				}
			: null;
		discountOpen = false;
	};
	let modifiersFor = $state<string | null>(null);
	let chosenVariant = $state<string | null>(null);
	let chosenOptions = $state<Record<string, string[]>>({});
	let method = $state<CreatePaymentInput['method']>('CASH');
	const checkout = new PosCheckout(api);
	let prepared = $state<OrderDto | null>(null);
	let ticketStarted = $state(false);
	let saving = $state(false);
	let reviewing = $state(false);
	let searchInput: HTMLInputElement | undefined = $state();

	let tendered = $state('');
	let paying = $state(false);
	let paymentAttempted = $state(false);
	const locked = $derived(paying || saving || reviewing || ticketStarted);
	$effect(() => {
		$branchSwitchLocked = !cart.isEmpty || ticketStarted;
		return () => {
			$branchSwitchLocked = false;
		};
	});
	const due = $derived(prepared?.totals.grandTotal ?? (cart.totalMinor / 100).toFixed(2));

	const products = $derived(catalog.data?.items ?? []);

	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		const matches = products.filter((product) => {
			if (activeCategory && product.categoryId !== activeCategory) return false;
			if (!needle) return true;
			return (
				product.name.toLowerCase().includes(needle) ||
				(product.sku ?? '').toLowerCase().includes(needle) ||
				(product.barcode ?? '').toLowerCase().includes(needle) ||
				product.aliases.some((alias) => alias.toLowerCase().includes(needle))
			);
		});
		if (sort === 'name') matches.sort((a, b) => a.name.localeCompare(b.name));
		if (sort === 'price-asc') matches.sort((a, b) => Number(a.price) - Number(b.price));
		if (sort === 'price-desc') matches.sort((a, b) => Number(b.price) - Number(a.price));
		return matches;
	});

	const categoryTabs = $derived([
		{
			id: null as string | null,
			name: 'Everything',
			count: activeCategory || query ? null : (catalog.data?.meta.total ?? products.length)
		},
		...(categories.data?.items ?? []).map((category) => ({
			id: category.id as string | null,
			name: category.name,
			count: null
		}))
	]);

	const modifierProduct = $derived(products.find((product) => product.id === modifiersFor) ?? null);

	const change = $derived(Math.max(0, Number(tendered || 0) * 100 - Number(due) * 100));

	/** The modal opens with the product's defaults already chosen, so "Add"
	 *  never has to guess what the cashier meant. */
	const openModifiers = (productId: string) => {
		const product = products.find((row) => row.id === productId);
		if (!product) return;
		chosenVariant = product.variants.find((variant) => variant.isDefault)?.id ?? null;
		chosenOptions = Object.fromEntries(
			product.modifierGroups.map((group) => [
				group.id,
				group.options.filter((option) => option.isDefault).map((option) => option.id)
			])
		);
		modifiersFor = productId;
	};

	const toggleOption = (groupId: string, optionId: string) => {
		const group = modifierProduct?.modifierGroups.find((row) => row.id === groupId);
		if (!group) return;
		const current = chosenOptions[groupId] ?? [];
		const has = current.includes(optionId);
		if (group.maxSelect === 1) {
			chosenOptions = { ...chosenOptions, [groupId]: has && !group.isRequired ? [] : [optionId] };
			return;
		}
		if (has) {
			chosenOptions = { ...chosenOptions, [groupId]: current.filter((id) => id !== optionId) };
		} else if (current.length < group.maxSelect) {
			chosenOptions = { ...chosenOptions, [groupId]: [...current, optionId] };
		}
	};

	const modifiersReady = $derived.by(() => {
		if (!modifierProduct) return false;
		return (
			(modifierProduct.variants.length < 2 || chosenVariant !== null) &&
			modifierProduct.modifierGroups.every(
				(group) =>
					(chosenOptions[group.id] ?? []).length >=
					Math.max(group.isRequired ? 1 : 0, group.minSelect)
			)
		);
	});

	const confirmModifiers = () => {
		if (!modifierProduct) return;
		const modifiers: CartModifier[] = modifierProduct.modifierGroups.flatMap((group) =>
			(chosenOptions[group.id] ?? []).flatMap((optionId) => {
				const option = group.options.find((row) => row.id === optionId);
				return option
					? [
							{
								modifierOptionId: option.id,
								name: option.name,
								priceDelta: option.priceDelta,
								quantity: 1
							}
						]
					: [];
			})
		);
		cart.addLine(modifierProduct, chosenVariant, modifiers);
		modifiersFor = null;
	};

	const chosenLinePreview = $derived.by(() => {
		if (!modifierProduct) return 0;
		const base = chosenVariant
			? Number(modifierProduct.variants.find((row) => row.id === chosenVariant)?.price ?? 0)
			: Number(modifierProduct.price);
		const deltas = modifierProduct.modifierGroups.reduce(
			(sum, group) =>
				sum +
				(chosenOptions[group.id] ?? []).reduce((inner, optionId) => {
					const option = group.options.find((row) => row.id === optionId);
					return inner + Number(option?.priceDelta ?? 0);
				}, 0),
			0
		);
		return Math.round((base + deltas) * 100);
	});

	/** Money enters the till as a decimal string; the API never sees a float. */
	const money = (minor: number): string => (minor / 100).toFixed(2);

	const reset = () => {
		cart.clear();
		checkout.reset();
		prepared = null;
		ticketStarted = false;
		tendered = '';
		method = 'CASH';
		paymentAttempted = false;
	};

	const preparePayment = async () => {
		if (cart.isEmpty || paying || saving || reviewing) return;
		reviewing = true;
		ticketStarted = true;
		try {
			prepared = await checkout.prepare(cart.toCreateInput($branchId, 'pending'));
			payOpen = true;
		} catch (error) {
			if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
				checkout.reset();
				ticketStarted = false;
			}
			toast.error(
				error instanceof Error
					? error.message
					: 'Could not price the ticket. Retry to check its status.'
			);
		} finally {
			reviewing = false;
		}
	};

	const save = async () => {
		if (cart.isEmpty || saving || paying || reviewing) return;
		saving = true;
		ticketStarted = true;
		try {
			prepared = await checkout.send(cart.toCreateInput($branchId, 'pending'));
			toast.success(`Ticket ${prepared.number} sent to kitchen`);
			reset();
			await queryClient.invalidateQueries({ queryKey: ['orders'] });
			await queryClient.invalidateQueries({ queryKey: ['kitchen'] });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Could not send the ticket. Retry to continue.'
			);
		} finally {
			saving = false;
		}
	};

	const charge = async () => {
		if (!prepared || paying) return;
		if (method === 'CASH' && tendered && Number(tendered) < Number(due)) {
			toast.error('Cash received is less than the total due');
			return;
		}
		paying = true;
		paymentAttempted = true;
		try {
			const order = await checkout.pay(method);
			toast.success(`Paid ${formatMoney(order.totals.grandTotal)}`, {
				description: `Ticket ${order.number} · ${PAYMENT_METHOD_LABEL[method]}`
			});
			payOpen = false;
			reset();
			await queryClient.invalidateQueries({ queryKey: ['orders'] });
			await queryClient.invalidateQueries({ queryKey: ['payments'] });
			await queryClient.invalidateQueries({ queryKey: ['reports'] });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Payment did not go through. Retry this payment.'
			);
		} finally {
			paying = false;
		}
	};

	const shortcut = (event: KeyboardEvent) => {
		if (event.key === 'F2') {
			event.preventDefault();
			searchInput?.focus();
		}
		if (event.key === 'F8' && !payOpen && !modifiersFor) {
			event.preventDefault();
			hold();
		}
		if (event.key === 'F4' && !payOpen && !modifiersFor) {
			event.preventDefault();
			void preparePayment();
		}
	};

	const METHODS = [
		{ id: 'CASH' as const, icon: Banknote },
		{ id: 'CARD' as const, icon: CreditCard },
		{ id: 'JAZZCASH' as const, icon: Smartphone },
		{ id: 'EASYPAISA' as const, icon: Smartphone },
		{ id: 'BANK_TRANSFER' as const, icon: Landmark }
	];
</script>

<svelte:window onkeydown={shortcut} />

<svelte:head><title>POS — SlatePOS</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1>Point of sale</h1>
		<p class="text-ink-3 mt-1 text-sm">Browse the menu and build a new order.</p>
	</div>
	<div class="text-ink-3 flex items-center gap-3 text-xs">
		<span><kbd class="kbd">F2</kbd> Search</span><span><kbd class="kbd">F4</kbd> Payment</span><span
			><kbd class="kbd">F8</kbd> Hold</span
		>
	</div>
</div>
<div class="pos-workspace">
	<!-- ── the menu ─────────────────────────────────────────────────────── -->
	<section class="pos-menu min-w-0 flex-1">
		<div class="pos-search-row mb-5 flex flex-wrap items-center gap-2">
			<Button variant="outline" disabled={!held.length} onclick={() => (heldOpen = true)}
				><Play size={15} /> Held tickets ({held.length})</Button
			>
			<div class="field-shell min-w-[220px] flex-1">
				<Search />
				<input
					class="field"
					{@attach (node) => {
						searchInput = node;
						return () => {
							searchInput = undefined;
						};
					}}
					aria-label="Search menu or scan barcode"
					maxlength={200}
					bind:value={query}
					oninput={() => (menuPage = 1)}
					placeholder="Search dishes, SKU or barcode…"
					autocomplete="off"
				/>
			</div>
			{#if query}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						query = '';
						menuPage = 1;
					}}>Clear</Button
				>
			{/if}
		</div>

		<div class="pos-menu-body">
			<Tabs.Root
				class="pos-category-nav"
				value={activeCategory ?? 'all'}
				onValueChange={(value) => {
					activeCategory = value === 'all' ? null : value;
					menuPage = 1;
				}}
			>
				<div class="pos-category-scroll">
					<Tabs.List
						variant="line"
						class="pos-category-list h-11 gap-5 p-0"
						aria-label="Menu categories"
					>
						{#each categoryTabs as tab (tab.id ?? 'all')}
							<Tabs.Trigger value={tab.id ?? 'all'} class="px-1 text-[13px]"
								>{tab.name}{#if tab.count !== null}<span class="text-muted-foreground ml-1 text-xs"
										>{tab.count}</span
									>{/if}</Tabs.Trigger
							>
						{/each}
					</Tabs.List>
				</div>
			</Tabs.Root>
			<div class="pos-menu-results">
				<div class="menu-toolbar">
					<h2>
						{categoryTabs.find((tab) => tab.id === activeCategory)?.name ?? 'Menu'}<span
							class="text-ink-3 ml-2 text-sm font-normal">{filtered.length} dishes</span
						>
					</h2>
					<div class="menu-tools">
						<SelectField
							aria-label="Sort menu"
							class="w-[150px] text-xs"
							bind:value={sort}
							onValueChange={() => (menuPage = 1)}
							items={[
								{ value: 'menu', label: 'Menu order' },
								{ value: 'name', label: 'Name A–Z' },
								{ value: 'price-asc', label: 'Price: low to high' },
								{ value: 'price-desc', label: 'Price: high to low' }
							]}
						/>
						<div class="view-toggle" role="group" aria-label="Menu view">
							<button
								type="button"
								aria-label="Grid view"
								aria-pressed={view === 'grid'}
								onclick={() => (view = 'grid')}><LayoutGrid size={16} /></button
							><button
								type="button"
								aria-label="List view"
								aria-pressed={view === 'list'}
								onclick={() => (view = 'list')}><List size={16} /></button
							>
						</div>
					</div>
				</div>

				{#if catalog.isError}
					<div class="plate p-6" role="alert">
						<h3>Menu could not be loaded</h3>
						<p class="text-ink-3 my-3">{catalog.error.message}</p>
						<Button onclick={() => catalog.refetch()}>Try again</Button>
					</div>
				{:else if catalog.isPending}
					<div class="menu-grid">
						{#each { length: 9 } as _, i (i)}
							<div class="skel h-[132px]"></div>
						{/each}
					</div>
				{:else if filtered.length === 0}
					<div class="plate">
						<Empty
							icon={Utensils}
							title={query ? 'Nothing on the menu matches' : 'No dishes yet'}
							body={query
								? 'Try a shorter word, or clear the search to see the whole menu.'
								: 'Add dishes in the Catalog and they appear here, priced and ready to ring up.'}
						>
							{#snippet action()}
								<Button size="sm" href="/catalog">Open the catalog</Button>
							{/snippet}
						</Empty>
					</div>
				{:else}
					<div class="menu-grid" class:is-list={view === 'list'}>
						{#each filtered as product (product.id)}
							{@const unavailable = !product.isAvailable || product.status !== 'ACTIVE'}
							{@const image = photoFor(product.name, product.imageUrl)}
							{@const quantity = cart.lines
								.filter((line) => line.productId === product.id)
								.reduce((total, line) => total + line.quantity, 0)}
							<button
								type="button"
								class="menu-product"
								aria-label={`${product.name} ${formatMoney(product.price)}`}
								disabled={unavailable || locked}
								onclick={() =>
									product.modifierGroups.length || product.variants.length > 1
										? openModifiers(product.id)
										: cart.addLine(product, product.variants[0]?.id ?? null)}
							>
								<div class="product-photo">
									{#if image}<img
											src={image}
											alt=""
											loading="lazy"
											onerror={(event) =>
												((event.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
										/>{:else}<div class="text-ink-3 grid h-full place-items-center">
											<Utensils size={30} strokeWidth={1.4} />
										</div>{/if}
								</div>
								{#if quantity}<span class="product-count" aria-hidden="true">{quantity}</span>{/if}
								<div class="product-copy">
									<p class="product-name">{product.name}</p>
									<p class="product-detail">
										{unavailable
											? 'Unavailable'
											: product.variants.length > 1
												? `${product.variants.length} sizes available`
												: product.modifierGroups.length
													? 'Customize your dish'
													: (categories.data?.items.find(
															(category) => category.id === product.categoryId
														)?.name ?? 'Menu item')}
									</p>
									<div class="product-bottom">
										<span class="product-price">{formatMoney(product.price)}</span><span
											class="product-add"
											aria-hidden="true"><Plus size={17} /></span
										>
									</div>
								</div>
							</button>
						{/each}
					</div>
				{/if}
				{#if catalog.data && catalog.data.meta.totalPages > 1}<div
						class="mt-5 flex flex-wrap items-center justify-between gap-3"
					>
						<p class="text-ink-3 text-xs">
							Page {menuPage} of {catalog.data.meta.totalPages} · {catalog.data.meta.total} dishes
						</p>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={menuPage <= 1}
								onclick={() => (menuPage -= 1)}>Previous</Button
							><Button
								variant="outline"
								size="sm"
								disabled={!catalog.data.meta.hasNext}
								onclick={() => (menuPage += 1)}>Next</Button
							>
						</div>
					</div>{/if}

				{#if $currentUser?.tenantSlug === 'demo'}<p class="text-ink-3 mt-4 text-xs">
						Demo menu photography is illustrative.
					</p>{/if}
			</div>
		</div>
	</section>

	<!-- ── the ticket: the cart is a live stub ──────────────────────────── -->
	{#if !mobileViewport.current}
		<aside class="pos-checkout" id="current-ticket">
			{@render ticketPanel()}
		</aside>
	{/if}
</div>

{#snippet ticketPanel()}
	<div
		class="checkout-panel {cart.tearing ? '' : 'anim-rise'}"
		style="--perf-at: 64%; {cart.tearing
			? 'animation: roms-tear 260ms var(--ease-stamp) forwards'
			: ''}"
	>
		<div class="ticket-heading flex items-center justify-between gap-3 px-4 py-3">
			<div class="flex items-center gap-2.5">
				<span class="text-muted-foreground bg-muted grid size-8 place-items-center rounded-md"
					><ShoppingBag size={20} /></span
				>
				<div>
					<p class="text-ink text-base font-semibold">Current ticket</p>
					<p class="text-ink-3 text-xs">
						{ORDER_TYPE_LABEL[cart.orderType]} · {$currentUser?.fullName?.split(' ')[0] ??
							'Counter'}
					</p>
				</div>
			</div>
			{#if !cart.isEmpty}
				<button
					type="button"
					class="btn btn-ghost btn-icon btn-sm"
					aria-label="Void the whole ticket"
					disabled={locked}
					onclick={reset}
				>
					<Trash2 size={15} />
				</button>
			{/if}
		</div>

		<div class="perf-rule mx-4"></div>

		<!-- order type + destination -->
		<div class="px-4 pt-1">
			<Tabs.Root
				value={cart.orderType}
				onValueChange={(value) => {
					if (!locked) cart.orderType = value as typeof cart.orderType;
				}}
			>
				<Tabs.List class="grid h-10 w-full grid-cols-3" aria-label="Order type">
					{#each ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as type (type)}<Tabs.Trigger
							value={type}
							disabled={locked}
							class="text-xs"
							>{ORDER_TYPE_LABEL[type as keyof typeof ORDER_TYPE_LABEL]}</Tabs.Trigger
						>{/each}
				</Tabs.List>
			</Tabs.Root>
			<Dropdown.Root
				><Dropdown.Trigger
					class="text-muted-foreground hover:text-foreground mt-2 text-[11px]"
					disabled={locked}
					>More order types{#if ['PICKUP', 'ONLINE'].includes(cart.orderType)}
						· {ORDER_TYPE_LABEL[cart.orderType]}{/if}</Dropdown.Trigger
				><Dropdown.Content
					><Dropdown.Item onclick={() => (cart.orderType = 'PICKUP')}>Pickup</Dropdown.Item
					><Dropdown.Item onclick={() => (cart.orderType = 'ONLINE')}>Online</Dropdown.Item
					></Dropdown.Content
				></Dropdown.Root
			>
		</div>
		{#if cart.orderType === 'DINE_IN'}
			<div class="px-4 pt-2.5">
				<Field label="Table" optional
					><SelectField
						aria-label="Table"
						disabled={locked}
						bind:value={cart.tableId}
						placeholder="Choose a table"
						items={(tables.data ?? []).map((table) => ({
							value: table.id,
							label: `${table.name} · ${table.capacity} seats`
						}))}
					/></Field
				>
			</div>
		{/if}

		<!-- who the ticket belongs to: the only line that survives on the receipt -->
		<div class="px-4 pt-2">
			<Field label="Customer"
				><SelectField
					aria-label="Customer"
					disabled={locked}
					value={cart.customerId ?? 'walk-in'}
					onValueChange={(value) => (cart.customerId = value === 'walk-in' ? null : value)}
					items={[
						{ value: 'walk-in', label: 'Walk-in customer' },
						...(customers.data?.items ?? []).map((customer) => ({
							value: customer.id,
							label: customer.name
						}))
					]}
				/></Field
			>
		</div>

		<!-- the lines -->
		{#if cart.isEmpty}
			<div class="px-6 py-10 text-center">
				<span
					class="bg-surface-3 text-ink-3 mx-auto mb-4 grid size-14 place-items-center rounded-2xl"
					><ShoppingBag size={24} strokeWidth={1.5} /></span
				>
				<p class="text-ink-2 text-sm font-medium">No items added</p>
				<p class="text-ink-3 mx-auto mt-1 max-w-[30ch] text-xs">
					Choose a product from the menu to start this order.
				</p>
			</div>
		{:else}
			<ul class="max-h-[38vh] overflow-y-auto px-2 py-2">
				{#each cart.lines as line (line.key)}
					{@const cartPhoto = photoFor(
						line.name,
						line.imageUrl ?? products.find((product) => product.id === line.productId)?.imageUrl
					)}
					<li class="anim-rise group hover:bg-surface-2 rounded-sm px-2 py-2 transition-colors">
						<div class="flex items-start gap-3">
							{#if cartPhoto}<img src={cartPhoto} alt="" class="cart-thumbnail" />{/if}
							<div class="min-w-0 flex-1">
								<p class="text-ink truncate text-sm font-[560]">{line.name}</p>
								{#if line.modifiers.length}
									<p class="text-ink-3 mt-0.5 truncate text-xs">
										{line.modifiers.map((m) => m.name).join(', ')}
									</p>
								{/if}
								<p class="u-num text-ink-3 mt-0.5 text-xs">
									{formatMoney(line.unitPrice)} each
								</p>
							</div>
							<p class="u-num text-ink shrink-0 text-sm font-[600]">
								{formatMoney(money(lineTotalMinor(line)))}
							</p>
						</div>

						<div class="mt-1.5 flex items-center gap-1">
							<button
								type="button"
								class="border-line-strong text-ink-2 hover:bg-surface-3 grid size-9 place-items-center rounded-xs border transition-colors"
								aria-label="One fewer {line.name}"
								disabled={locked}
								onclick={() => cart.step(line.key, -1)}
							>
								{#if line.quantity === 1}<Trash2 size={12} />{:else}<Minus size={12} />{/if}
							</button>
							<span aria-live="polite" class="u-num text-ink w-7 text-center text-[12px] font-[620]"
								>{line.quantity}</span
							>
							<button
								type="button"
								class="border-line-strong text-ink-2 hover:bg-surface-3 grid size-9 place-items-center rounded-xs border transition-colors"
								aria-label="One more {line.name}"
								disabled={locked}
								onclick={() => cart.step(line.key, 1)}
							>
								<Plus size={12} />
							</button>
							<!-- Kept visible: the POS runs on a touchscreen, where
								     there is no hover to reveal it. On a pointer device
								     it still quietens until the row is engaged, which
								     keeps the ticket from looking like a toolbar. -->
							<button
								type="button"
								class="btn btn-ghost btn-icon btn-sm text-ink-3 hover:text-brick ml-auto opacity-60 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
								aria-label="Remove {line.name}"
								disabled={locked}
								onclick={() => cart.remove(line.key)}
							>
								<X size={13} />
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="perf-rule mx-4"></div>

		<!-- totals, the way a receipt prints them -->
		<div class="space-y-1.5 px-4 py-3">
			<div class="flex items-baseline justify-between text-[12px]">
				<span class="text-ink-3">Subtotal</span>
				<span class="u-num text-ink-2">{formatMoney(money(cart.subtotalMinor))}</span>
			</div>

			{#if cart.discountMinor > 0}
				<div class="flex items-baseline justify-between text-[12px]">
					<span class="text-ink-3">
						Discount{#if cart.discount?.type === 'PERCENT'}
							({Number(cart.discount.value) * 100}%){/if}
					</span>
					<span class="u-num text-brick">−{formatMoney(money(cart.discountMinor))}</span>
				</div>
			{/if}

			<div class="flex items-baseline justify-between text-[12px]">
				<span class="text-ink-3">Tax & service</span>
				<span class="u-num text-ink-2">
					{cart.taxMinor ? formatMoney(money(cart.taxMinor)) : 'Calculated at charge'}
				</span>
			</div>

			{#if cart.tipMinor > 0}
				<div class="flex items-baseline justify-between text-[12px]">
					<span class="text-ink-3">Tip</span>
					<span class="u-num text-ink-2">{formatMoney(money(cart.tipMinor))}</span>
				</div>
			{/if}

			<div class="border-line mt-2 flex items-end justify-between border-t pt-2.5">
				<span class="u-label">{prepared ? 'Total due' : 'Before tax & service'}</span>
				<span class="u-figure text-ink text-[24px]">{formatMoney(due)}</span>
			</div>
		</div>

		{#if ticketStarted && !prepared}<p
				class="text-amber bg-amber-wash mx-4 mb-3 rounded-sm p-3 text-xs"
			>
				Ticket status is unconfirmed. Retry Charge to recover this ticket.
			</p>{/if}
		{#if prepared}<div class="bg-slate-wash text-slate mx-4 mb-3 rounded-sm p-3 text-xs">
				Ticket {prepared.number} is saved. Complete payment or send it to the kitchen.
				<a class="underline" href="/orders/{prepared.id}">View ticket</a>
			</div>{/if}
		<!-- the till's minor controls -->
		<div class="flex flex-wrap items-center gap-1.5 px-4 pb-3">
			<button
				type="button"
				class="border-border text-muted-foreground hover:bg-muted inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs"
				disabled={locked}
				onclick={() => {
					discountValue = cart.discount
						? String(Number(cart.discount.value) * (cart.discount.type === 'PERCENT' ? 100 : 1))
						: '';
					discountType = cart.discount?.type ?? 'PERCENT';
					discountOpen = true;
				}}
			>
				<Percent size={12} />
				Discount
			</button>
			<Dropdown.Root
				><Dropdown.Trigger
					class="border-border text-muted-foreground inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs"
					disabled={locked}
					>Tip: {cart.tipMinor ? formatMoney(money(cart.tipMinor)) : 'None'}</Dropdown.Trigger
				><Dropdown.Content
					>{#each [0, 10000, 20000] as tip (tip)}<Dropdown.Item
							onclick={() => (cart.tipMinor = tip)}
							>{tip === 0 ? 'No tip' : formatMoney(money(tip))}</Dropdown.Item
						>{/each}</Dropdown.Content
				></Dropdown.Root
			>
		</div>

		<div class="flex items-center justify-between px-4 pb-3">
			<Button variant="ghost" size="sm" disabled={cart.isEmpty || locked} onclick={hold}
				><Pause size={14} /> Hold ticket</Button
			>
			<Button variant="ghost" size="sm" disabled={locked} onclick={() => (notesOpen = true)}
				><StickyNote size={14} /> {cart.notes ? 'Edit notes' : 'Add notes'}</Button
			>
		</div>
		<footer class="border-line bg-surface-2 flex gap-2 border-t p-3">
			<Button
				variant="outline"
				class="flex-1"
				loading={saving}
				disabled={cart.isEmpty || paying || reviewing}
				onclick={save}
			>
				Send to kitchen
			</Button>
			<Button
				class="flex-1"
				loading={reviewing}
				disabled={cart.isEmpty || paying || saving}
				onclick={preparePayment}
			>
				Charge
			</Button>
		</footer>
	</div>
{/snippet}
{#if !cart.isEmpty && mobileViewport.current && !mobileTicket}<a
		class="mobile-ticket-bar"
		href="#current-ticket"
		onclick={(event) => {
			event.preventDefault();
			mobileTicket = true;
		}}
		><span>{cart.count} items · View ticket</span><strong class="u-num">{formatMoney(due)}</strong
		></a
	>{/if}
<Sheet.Root bind:open={mobileTicket}>
	<Sheet.Content
		side="right"
		class="gap-0 overflow-y-auto p-0 data-[side=right]:w-full sm:max-w-[420px]"
		showCloseButton={false}
	>
		<Sheet.Header class="border-border flex-row items-center justify-between border-b px-4 py-3"
			><Sheet.Title class="text-sm">Your order</Sheet.Title><Sheet.Description class="sr-only"
				>Review items and complete checkout</Sheet.Description
			><Sheet.Close class="text-muted-foreground hover:bg-muted rounded-md px-2 py-1 text-xs"
				>Back to menu</Sheet.Close
			></Sheet.Header
		>
		<div id="current-ticket" class="mobile-checkout-content">{@render ticketPanel()}</div>
	</Sheet.Content>
</Sheet.Root>

<!-- ── modifiers ────────────────────────────────────────────────────────── -->
<Modal
	open={modifiersFor !== null}
	onOpenChange={(value) => {
		if (!value) modifiersFor = null;
	}}
	title={modifierProduct?.name ?? 'Choose options'}
	sub="Sized and made to order"
	width={520}
>
	{#if modifierProduct}
		<div class="space-y-5">
			{#if modifierProduct.variants.length > 1}
				<div>
					<p class="lbl">Size</p>
					<div class="flex flex-wrap gap-1.5">
						{#each modifierProduct.variants as variant (variant.id)}
							<button
								type="button"
								class="chip"
								aria-pressed={chosenVariant === variant.id}
								onclick={() => (chosenVariant = variant.id)}
							>
								{variant.name}
								<span class="chip-count">{formatMoney(variant.price)}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#each modifierProduct.modifierGroups as group (group.id)}
				<div>
					<p class="lbl">
						{group.name}
						{#if group.isRequired}<span class="text-brick"> *</span>{/if}
						<span class="text-ink-3 ml-1 font-[400]">
							{#if group.maxSelect === 1}
								choose one
							{:else}
								up to {group.maxSelect}
							{/if}
						</span>
					</p>
					<div class="flex flex-wrap gap-1.5">
						{#each group.options as option (option.id)}
							<button
								type="button"
								class="chip"
								aria-pressed={(chosenOptions[group.id] ?? []).includes(option.id)}
								onclick={() => toggleOption(group.id, option.id)}
							>
								{option.name}
								{#if Number(option.priceDelta) !== 0}
									<span class="chip-count">+{formatMoney(option.priceDelta)}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (modifiersFor = null)}>Cancel</Button>
		<Button disabled={!modifiersReady} onclick={confirmModifiers}>
			Add · {formatMoney(money(chosenLinePreview))}
		</Button>
	{/snippet}
</Modal>

<!-- ── the charge ───────────────────────────────────────────────────────── -->
<Modal
	bind:open={payOpen}
	onOpenChange={(value) => {
		if (!value) payOpen = false;
	}}
	title="Charge the ticket"
	presentation="sheet"
	sub={`${prepared?.number ?? 'Ticket'} · ${cart.count} items · ${formatMoney(due)}`}
	width={520}
>
	<div class="form-stack">
		<div>
			<p class="lbl">How is it being paid?</p>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each METHODS as option (option.id)}
					<button
						type="button"
						class="flex items-center gap-2 rounded-sm border px-3 py-2.5 text-sm font-[540] transition-colors
								{method === option.id
							? 'border-brass bg-brass-wash text-brass-ink'
							: 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'}"
						aria-pressed={method === option.id}
						disabled={paying || paymentAttempted}
						onclick={() => (method = option.id)}
					>
						<option.icon size={16} strokeWidth={1.7} />
						{PAYMENT_METHOD_LABEL[option.id] ?? option.id}
					</button>
				{/each}
			</div>
		</div>

		{#if method === 'CASH'}
			<Field
				label="Cash received"
				hint="Used to work out the change; the exact total is what gets recorded."
			>
				<Input
					step="any"
					class=""
					type="number"
					inputmode="decimal"
					aria-label="Cash received"
					bind:value={tendered}
					placeholder={due}
				/>
			</Field>
			{#if Number(tendered) > 0}
				<div class="bg-surface-2 flex items-center justify-between rounded-sm px-3 py-2.5">
					<span class="u-label">Change due</span>
					<span class="u-num text-[16px] font-[640] {change > 0 ? 'text-herb' : 'text-ink'}">
						{formatMoney(money(change))}
					</span>
				</div>
			{/if}
		{/if}

		<div class="border-line bg-surface-2 rounded-sm border px-3 py-2.5">
			<div class="flex items-baseline justify-between">
				<span class="u-label">Charging now</span>
				<span class="u-num text-ink text-[17px] font-[660]">{formatMoney(due)}</span>
			</div>
			<p class="text-ink-3 mt-1 text-xs">
				Includes tax and service charges. This is the final ticket total.
			</p>
		</div>
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (payOpen = false)}>Cancel</Button>
		<Button loading={paying} disabled={!prepared} onclick={charge}>
			{#if !paying}<Check size={15} />{/if}
			Take {formatMoney(due)}
		</Button>
	{/snippet}
</Modal>

<Modal
	presentation="sheet"
	bind:open={heldOpen}
	title="Held tickets"
	sub="Saved on this terminal for the active branch"
>
	{#each held as ticket (ticket.id)}
		<div class="border-line flex items-center justify-between gap-4 border-b py-4">
			<div>
				<p class="font-semibold">{ticket.lines.map((line) => line.name).join(', ')}</p>
				<p class="text-ink-3 mt-1 text-xs">
					{ticket.at} · {ORDER_TYPE_LABEL[ticket.type]} · {ticket.lines.reduce(
						(sum, line) => sum + line.quantity,
						0
					)} items
				</p>
			</div>
			<Button variant="outline" disabled={!cart.isEmpty} onclick={() => resume(ticket.id)}
				>Resume</Button
			>
		</div>
	{/each}
</Modal>
<Modal
	bind:open={notesOpen}
	title="Ticket notes"
	sub="Special instructions for the kitchen and floor"
>
	<Field
		label="Instructions"
		hint="Include allergies, preparation requests or service notes."
		for="ticket-notes"
		><Textarea
			id="ticket-notes"
			class=""
			maxlength={500}
			bind:value={cart.notes}
			placeholder="Allergies, preparation requests, or service notes…"
		></Textarea></Field
	>
	{#snippet footer()}<Button onclick={() => (notesOpen = false)}>Save notes</Button>{/snippet}
</Modal>
<Modal
	bind:open={discountOpen}
	title="Apply a discount"
	sub="The final amount is checked when the ticket is saved"
>
	<div class="form-stack">
		<Field label="Discount type" for="discount-type"
			><SelectField
				id="discount-type"
				class=""
				bind:value={discountType}
				items={[
					{ value: 'PERCENT', label: `Percentage` },
					{ value: 'FIXED', label: `Fixed amount (PKR)` }
				]}
			/></Field
		><Field label={discountType === 'PERCENT' ? 'Percentage' : 'Amount (PKR)'} for="discount-value"
			><Input
				id="discount-value"
				class=""
				type="number"
				min="0"
				max={discountType === 'PERCENT' ? 100 : undefined}
				bind:value={discountValue}
			/></Field
		>
	</div>
	{#snippet footer()}<Button variant="ghost" onclick={() => (discountOpen = false)}>Cancel</Button
		><Button onclick={applyDiscount}>Apply discount</Button>{/snippet}
</Modal>

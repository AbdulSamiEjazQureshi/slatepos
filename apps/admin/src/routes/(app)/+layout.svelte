<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { session, authenticated } from '#lib/session';
	import { startRealtime, stopRealtime } from '#lib/realtime';
	import { closePalette, togglePalette } from '#lib/ui/palette-store';
	import Rail from '#lib/ui/rail.svelte';
	import SectionNav from '#lib/ui/section-nav.svelte';
	import { page } from '$app/state';
	import Topbar from '#lib/ui/topbar.svelte';
	import Palette from '#lib/ui/palette.svelte';

	let { children } = $props();
	let ready = $state(false);
	let mobileNav = $state(false);

	onMount(() => {
		let disposeShortcuts = () => {};
		let disposed = false;
		let disposeSession = () => {};

		(async () => {
			if (!session.apiToken().token) await session.restore();
			if (disposed) return;
			if (!session.apiToken().token) {
				await goto('/login');
				return;
			}
			ready = true;
			startRealtime();
			disposeSession = authenticated.subscribe((value) => {
				if (!value) void goto('/login');
			});

			const keyHandler = (event: KeyboardEvent) => {
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
					event.preventDefault();
					togglePalette();
				}
				if (event.key === 'Escape') closePalette();
			};
			window.addEventListener('keydown', keyHandler);
			disposeShortcuts = () => window.removeEventListener('keydown', keyHandler);
		})();

		return () => {
			disposed = true;
			disposeSession();
			disposeShortcuts();
			stopRealtime();
		};
	});
</script>

{#if ready}
	<div
		class="workspace-shell bg-ground flex h-dvh flex-col overflow-hidden"
		class:cashier-workspace={page.url.pathname === '/pos'}
	>
		<a href="#workspace-content" class="skip-link">Skip to content</a>
		<Topbar onMenu={() => (mobileNav = true)} />
		<SectionNav />
		<div class="workspace-body flex min-h-0 flex-1">
			<Rail bind:mobileOpen={mobileNav} />
			<main
				id="workspace-content"
				tabindex="-1"
				class="workspace-main min-h-0 min-w-0 flex-1 overflow-y-auto"
			>
				<div class="workspace-content mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8">
					{@render children()}
				</div>
			</main>
		</div>
	</div>
	<Palette />
{:else}
	<div class="bg-ground grid h-dvh place-items-center">
		<div class="flex flex-col items-center gap-3">
			<div
				class="border-line border-t-brass size-6 rounded-full border-2"
				style="animation: roms-spin .7s linear infinite"
			></div>
			<p class="text-ink-3 text-[12px]">Opening workspace…</p>
		</div>
	</div>
{/if}

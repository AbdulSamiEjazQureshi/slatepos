<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { session, authenticated } from '#lib/session';
	import { startRealtime, stopRealtime } from '#lib/realtime';
	import { closePalette, togglePalette } from '#lib/ui/palette-store';
	import Rail from '#lib/ui/rail.svelte';
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
	<div class="bg-ground flex h-dvh overflow-hidden">
		<Rail bind:mobileOpen={mobileNav} />

		<div class="flex min-w-0 flex-1 flex-col">
			<Topbar onMenu={() => (mobileNav = true)} />
			<main class="min-h-0 flex-1 overflow-y-auto">
				<div class="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
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

<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { session } from '#lib/session';
	import { theme, toggleTheme } from '#lib/theme';
	import Button from '#lib/ui/button.svelte';
	import Field from '#lib/ui/field.svelte';
	import BrandMark from '#lib/ui/brand-mark.svelte';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Utensils from '@lucide/svelte/icons/utensils';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	let email = $state(dev ? 'owner@demo.test' : '');
	let password = $state(dev ? 'Password123' : '');
	let tenantSlug = $state('');
	let showPassword = $state(false);
	let capsLock = $state(false);
	let submitting = $state(false);
	let failure = $state<string | null>(null);
	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting || !hydrated) return;
		submitting = true;
		failure = null;
		try {
			await session.login(email.trim(), password, tenantSlug.trim() || undefined);
			toast.success('Welcome back');
			await goto('/dashboard');
		} catch (error) {
			failure =
				error instanceof TypeError
					? 'We couldn’t reach your workspace. Check your connection and try again.'
					: error instanceof Error
						? error.message
						: 'Unable to sign in. Please try again.';
		} finally {
			submitting = false;
		}
	};
</script>

<svelte:head><title>Sign in — SlatePOS</title></svelte:head>
<main class="login-layout">
	<section class="login-form-side">
		<a href="/" class="login-brand"
			><span class="login-mark"><BrandMark size={24} /></span><span>SlatePOS</span></a
		>
		<button
			type="button"
			class="btn btn-ghost btn-icon theme-toggle"
			aria-label="Toggle theme"
			onclick={toggleTheme}
			>{#if $theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}</button
		>
		<div class="login-form">
			<h1>Welcome back</h1>
			<p class="text-ink-3 mt-3 text-base">Sign in to your restaurant workspace.</p>
			{#if failure}<div
					class="bg-brick-wash text-brick mt-6 flex items-start gap-3 rounded-lg p-4 text-sm"
					role="alert"
				>
					<CircleAlert size={18} class="mt-0.5 shrink-0" /><span>{failure}</span>
				</div>{/if}
			<form onsubmit={submit} class="mt-8 flex flex-col gap-5">
				<Field label="Email" for="email"
					><Input
						id="email"
						class=" login-field"
						type="email"
						bind:value={email}
						autocomplete="username"
						placeholder="you@restaurant.com"
						required
					/></Field
				>
				<Field label="Password" for="password"
					><div class="relative">
						<Input
							id="password"
							class=" login-field pr-12"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							autocomplete="current-password"
							placeholder="Enter your password"
							required
							onkeydown={(event) => (capsLock = event.getModifierState('CapsLock'))}
							onkeyup={(event) => (capsLock = event.getModifierState('CapsLock'))}
						/><button
							type="button"
							class="text-ink-3 absolute top-1 right-1 grid size-10 place-items-center rounded-md"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
							onclick={() => (showPassword = !showPassword)}
							>{#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}</button
						>
					</div>
					{#if capsLock}<p class="text-amber mt-2 text-xs">Caps Lock is on</p>{/if}</Field
				>
				<details>
					<summary class="text-ink-3 cursor-pointer text-xs">Choose another workspace</summary>
					<div class="mt-3">
						<Field label="Workspace slug" hint="Leave empty for your default workspace."
							><Input
								class=""
								bind:value={tenantSlug}
								placeholder="acme-kitchen"
								autocomplete="organization"
							/></Field
						>
					</div>
				</details>
				<Button
					type="submit"
					size="lg"
					disabled={!hydrated}
					loading={submitting}
					class="mt-1 w-full"
					>{submitting ? 'Signing in…' : 'Sign in'}{#if !submitting}<ArrowRight
							size={17}
						/>{/if}</Button
				>
			</form>
			{#if dev}<div class="border-line bg-surface-2 mt-6 rounded-lg border p-4">
					<p class="text-ink-2 text-xs">Exploring the workspace?</p>
					<button
						type="button"
						class="text-brass-ink mt-1 text-sm font-medium underline-offset-4 hover:underline"
						onclick={() => {
							email = 'owner@demo.test';
							password = 'Password123';
						}}>Use the demo credentials <span aria-hidden="true">→</span></button
					>
				</div>{/if}
			<p class="text-ink-3 mt-8 text-xs">Need access? Ask your workspace administrator.</p>
		</div>
		<p class="login-footer">ROMS · Restaurant operating management</p>
	</section>
	<section class="login-story" aria-label="Restaurant workspace overview">
		<div class="story-content">
			<h2>Good service.<br />All in one place.</h2>
			<p>
				From the first order to the daily close. Bring your menu, kitchen, and team into one
				workspace.
			</p>
			<div class="story-photos" aria-hidden="true">
				<img src="/demo-menu/burger.jpg" alt="" class="story-burger" /><img
					src="/demo-menu/fries.jpg"
					alt=""
					class="story-fries"
				/>
			</div>
			<div class="story-capabilities">
				<span><Utensils size={17} /> Orders & POS</span><span><CookingPot size={17} /> Kitchen</span
				><span><ChartNoAxesColumn size={17} /> Insights</span>
			</div>
		</div>
	</section>
</main>

<style>
	.login-layout {
		display: grid;
		min-height: 100dvh;
		grid-template-columns: 1fr;
		background: var(--surface);
	}
	.login-form-side {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 32px;
	}
	.login-brand {
		display: flex;
		align-items: center;
		gap: 10px;
		width: fit-content;
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--ink);
	}
	.login-mark {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		background: var(--brass-wash);
		border-radius: 12px;
	}
	.theme-toggle {
		position: absolute;
		top: 32px;
		right: 32px;
	}
	.login-form {
		width: 100%;
		max-width: 380px;
		margin: auto;
		padding-block: 64px;
	}
	.login-form h1 {
		font-size: 32px;
		letter-spacing: -0.03em;
	}
	:global(.login-field) {
		height: 48px;
		font-size: 14px;
	}
	.login-footer {
		color: var(--ink-3);
		font-size: 11px;
	}
	.login-story {
		display: none;
		background: var(--brass-wash);
		margin: 20px;
		border-radius: 20px;
		padding: 48px;
	}
	.story-content {
		width: 100%;
		max-width: 520px;
		margin: auto;
	}
	.story-content h2 {
		font-size: clamp(36px, 4vw, 56px);
		line-height: 1.12;
		letter-spacing: -0.035em;
	}
	.story-content > p {
		color: var(--ink-2);
		font-size: 16px;
		line-height: 1.7;
		margin-top: 20px;
		max-width: 36ch;
	}
	.story-photos {
		position: relative;
		height: 320px;
		margin-top: 40px;
	}
	.story-photos img {
		position: absolute;
		object-fit: cover;
		border: 8px solid var(--surface);
		border-radius: 18px;
		box-shadow: var(--shadow-3);
	}
	.story-burger {
		top: 0;
		left: 0;
		width: 60%;
		height: 270px;
		transform: rotate(-6deg);
	}
	.story-fries {
		bottom: 0;
		right: 0;
		width: 49%;
		height: 210px;
		transform: rotate(7deg);
	}
	.story-capabilities {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 20px;
		margin-top: 36px;
		color: var(--ink-2);
	}
	.story-capabilities span {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}
	@media (min-width: 1024px) {
		.login-layout {
			grid-template-columns: 1fr 1fr;
		}
		.login-story {
			display: flex;
		}
		.login-form-side {
			padding: 40px;
		}
		.theme-toggle {
			top: 40px;
			right: 40px;
		}
	}
	@media (max-width: 480px) {
		.login-form-side {
			padding: 24px;
		}
		.login-form {
			padding-block: 48px;
		}
		.theme-toggle {
			top: 24px;
			right: 24px;
		}
	}
</style>

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
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	let email = $state(dev ? 'owner@demo.test' : '');
	let password = $state(dev ? 'Password123' : '');
	let tenantSlug = $state('');
	let alternateWorkspace = $state(false);
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
				error instanceof TypeError ||
				(error instanceof Error && /failed to fetch|network/i.test(error.message))
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
<div class="signin-page">
	<header class="signin-header">
		<a href="/" class="signin-brand"><BrandMark size={26} /><span>SlatePOS</span></a>
		<button
			type="button"
			class="btn btn-ghost btn-icon"
			aria-label="Toggle theme"
			onclick={toggleTheme}
			>{#if $theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}</button
		>
	</header>
	<main class="signin-layout">
		<section class="signin-story" aria-label="Restaurant workspace overview">
			<div class="signin-story-copy">
				<h2>Ready for<br />your next service.</h2>
				<p>Your menu, orders, kitchen and team.<br />One workspace, from opening to closing.</p>
			</div>
			<div class="signin-photo">
				<img src="/demo-menu/burger.jpg" alt="A burger from the illustrative demo menu" /><span
					>Built around your restaurant.</span
				>
			</div>
		</section>
		<section class="signin-form-side" aria-labelledby="signin-title">
			<div class="signin-form">
				<h1 id="signin-title">Sign in to your workspace</h1>
				<p class="signin-intro">Use the email and password provided by your administrator.</p>
				{#if failure}<div class="signin-error" role="alert">
						<CircleAlert size={18} />
						<p>{failure}</p>
					</div>{/if}
				<form onsubmit={submit} class="form-stack signin-fields">
					<Field label="Email" for="email" required
						><Input
							id="email"
							type="email"
							bind:value={email}
							autocomplete="username"
							placeholder="you@restaurant.com"
							required
						/></Field
					>
					<Field label="Password" for="password" required>
						<div class="signin-password">
							<Input
								id="password"
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								autocomplete="current-password"
								placeholder="Enter your password"
								required
								onkeydown={(event) => (capsLock = event.getModifierState('CapsLock'))}
								onkeyup={(event) => (capsLock = event.getModifierState('CapsLock'))}
							/>
							<button
								type="button"
								aria-label={showPassword ? 'Hide password' : 'Show password'}
								aria-pressed={showPassword}
								onclick={() => (showPassword = !showPassword)}
								>{#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}</button
							>
						</div>
						{#if capsLock}<p class="text-amber mt-2 text-xs">Caps Lock is on</p>{/if}
					</Field>
					<div class="signin-workspace">
						<button
							type="button"
							class="signin-workspace-toggle"
							aria-expanded={alternateWorkspace}
							aria-controls="alternate-workspace"
							onclick={() => (alternateWorkspace = !alternateWorkspace)}
							>Choose another workspace<span>{alternateWorkspace ? 'Hide' : 'Change'}</span></button
						>
						{#if alternateWorkspace}<div id="alternate-workspace" class="mt-4">
								<Field label="Workspace" hint="Leave blank to use your default workspace." optional
									><Input
										bind:value={tenantSlug}
										placeholder="restaurant-name"
										autocomplete="organization"
									/></Field
								>
							</div>{/if}
					</div>
					<Button
						type="submit"
						size="lg"
						disabled={!hydrated}
						loading={submitting}
						class="signin-submit"
						>{submitting ? 'Signing in…' : 'Sign in'}{#if !submitting}<ArrowRight
								size={17}
							/>{/if}</Button
					>
				</form>
				<p class="signin-access">Need access? <span>Ask your workspace administrator.</span></p>
				{#if dev}<div class="signin-demo">
						<div>
							<p>Explore SlatePOS</p>
							<span>Try the seeded restaurant workspace.</span>
						</div>
						<button
							type="button"
							onclick={() => {
								email = 'owner@demo.test';
								password = 'Password123';
							}}>Use demo</button
						>
					</div>{/if}
			</div>
		</section>
	</main>
	<footer class="signin-footer">ROMS · Restaurant operating management</footer>
</div>

<style>
	.signin-page {
		min-height: 100dvh;
		background: var(--ground);
		display: flex;
		flex-direction: column;
	}
	.signin-header {
		height: 88px;
		padding: 24px 48px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.signin-brand {
		display: flex;
		gap: 12px;
		align-items: center;
		font-family: 'Archivo', sans-serif;
		font-size: 22px;
		font-weight: 600;
	}
	.signin-layout {
		width: min(1200px, calc(100% - 96px));
		margin: auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		background: var(--surface);
		border-radius: 20px;
		overflow: hidden;
	}
	.signin-story {
		background: #163c36;
		padding: 48px;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}
	.signin-story h2 {
		color: #edf5f0;
		font-size: clamp(36px, 3.5vw, 48px);
		line-height: 1.12;
	}
	.signin-story p {
		color: #bed4c8;
		font-size: 15px;
		line-height: 1.8;
		margin-top: 20px;
	}
	.signin-photo {
		position: relative;
		flex: 1;
		min-height: 280px;
		border-radius: 12px;
		overflow: hidden;
	}
	.signin-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		position: absolute;
		inset: 0;
	}
	.signin-photo span {
		position: absolute;
		bottom: 16px;
		left: 16px;
		right: 16px;
		padding: 12px 16px;
		background: #163c36;
		color: #edf5f0;
		font-size: 13px;
		border-radius: 8px;
	}
	.signin-form-side {
		padding: 48px;
		display: flex;
		align-items: center;
	}
	.signin-form {
		width: 100%;
		max-width: 400px;
		margin: auto;
	}
	.signin-form h1 {
		font-size: 28px;
		line-height: 1.25;
		max-width: 18ch;
	}
	.signin-intro {
		color: var(--ink-3);
		font-size: 14px;
		line-height: 1.7;
		margin-top: 12px;
	}
	.signin-fields {
		margin-top: 32px;
		gap: 24px;
	}
	.signin-password {
		position: relative;
	}
	.signin-password :global(input) {
		padding-right: 48px;
	}
	.signin-password button {
		position: absolute;
		right: 2px;
		top: 2px;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 6px;
		color: var(--ink-3);
		cursor: pointer;
	}
	.signin-error {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		background: var(--brick-wash);
		color: var(--brick);
		border-radius: 8px;
		padding: 16px;
		margin-top: 24px;
		font-size: 13px;
	}
	.signin-error :global(svg) {
		flex-shrink: 0;
	}
	.signin-workspace-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		font-size: 12px;
		color: var(--ink-3);
		cursor: pointer;
		min-height: 32px;
	}
	.signin-workspace-toggle span {
		color: var(--brass-ink);
		font-weight: 500;
	}
	:global(.signin-submit) {
		width: 100%;
		min-height: 48px;
	}
	.signin-access {
		color: var(--ink-3);
		font-size: 12px;
		line-height: 1.6;
		margin-top: 24px;
	}
	.signin-access span {
		display: block;
	}
	.signin-demo {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding-top: 24px;
		margin-top: 24px;
		border-top: 1px solid var(--line);
	}
	.signin-demo p {
		font-size: 13px;
		font-weight: 500;
	}
	.signin-demo span {
		display: block;
		font-size: 12px;
		color: var(--ink-3);
		margin-top: 4px;
	}
	.signin-demo button {
		flex-shrink: 0;
		padding: 10px 12px;
		color: var(--brass-ink);
		background: var(--brass-wash);
		border-radius: 8px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
	}
	.signin-footer {
		padding: 24px;
		text-align: center;
		font-size: 11px;
		color: var(--ink-3);
	}
	@media (max-width: 1023px) {
		.signin-layout {
			width: min(600px, calc(100% - 48px));
			grid-template-columns: 1fr;
		}
		.signin-story {
			display: none;
		}
		.signin-header {
			padding-inline: 24px;
		}
		.signin-form-side {
			padding: 40px;
		}
	}
	@media (max-width: 479px) {
		.signin-header {
			height: 72px;
		}
		.signin-layout {
			width: 100%;
			border-radius: 0;
			background: transparent;
		}
		.signin-form-side {
			padding: 32px 24px;
		}
		.signin-form h1 {
			font-size: 26px;
		}
		.signin-demo {
			gap: 12px;
		}
	}
</style>

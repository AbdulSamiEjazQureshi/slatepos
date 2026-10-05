<script lang="ts">
	import Field from './field.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	let { from = $bindable(), to = $bindable() }: { from: string; to: string } = $props();
</script>

<div class="date-range-fields" role="group" aria-label="Report period">
	<Field label="Start date"><Input type="date" bind:value={from} /></Field>
	<Field label="End date"><Input type="date" bind:value={to} /></Field>
</div>

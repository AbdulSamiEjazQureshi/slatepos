<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, description, children }: { title: string; description?: string; children: Snippet } =
		$props();
</script>

<fieldset class="form-section">
	<legend>{title}</legend>
	{#if description}<p class="form-section-description">{description}</p>{/if}
	<div class="form-grid">{@render children()}</div>
</fieldset>

<script lang="ts">
	let { size = 22 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex:none"
	><rect x="3" y="3" width="8" height="8" rx="2.5" fill="var(--brass)" /><rect
		x="13"
		y="3"
		width="8"
		height="8"
		rx="2.5"
		fill="var(--brass)"
		opacity=".5"
	/><rect x="3" y="13" width="8" height="8" rx="2.5" fill="var(--brass)" opacity=".5" /><rect
		x="13"
		y="13"
		width="8"
		height="8"
		rx="2.5"
		fill="var(--brass)"
	/></svg
>

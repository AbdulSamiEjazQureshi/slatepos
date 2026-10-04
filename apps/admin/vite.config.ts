import { fileURLToPath } from 'node:url';
import { enhancedImages } from '@sveltejs/enhanced-img';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// This CSS-only package exports a style condition; resolve its file explicitly for SSR builds.
	resolve: {
		alias: {
			'tw-animate-css': fileURLToPath(
				new URL('./node_modules/tw-animate-css/dist/tw-animate.css', import.meta.url)
			)
		}
	},
	envDir: fileURLToPath(new URL('../../', import.meta.url)),
	plugins: [
		enhancedImages(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},

			// Build a standalone production server.
			adapter: adapter()
		})
	]
});

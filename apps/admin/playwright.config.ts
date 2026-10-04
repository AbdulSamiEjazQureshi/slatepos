import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration for critical cashier workflows. Requires the API and web
 * dev servers to be running (or started by `webServer`).
 */
export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		launchOptions: {
			...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
				? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
				: {})
		}
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'bun run dev -- --port 5173',
		port: 5173,
		reuseExistingServer: true,
		timeout: 120_000
	}
});

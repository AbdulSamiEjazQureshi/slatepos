import { expect, test } from '@playwright/test';

test('customer form blocks an invalid email and clears its field error after correction', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard/);
	await page.getByRole('link', { name: 'Back office', exact: true }).click();
	await page.getByRole('button', { name: 'Add a customer', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Form validation check');
	await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('invalid-email');
	let createRequests = 0;
	page.on('request', (request) => {
		if (request.method() === 'POST' && request.url().includes('/customers')) createRequests += 1;
	});
	await dialog.getByRole('button', { name: 'Add customer', exact: true }).click();
	await expect(dialog.getByRole('textbox', { name: 'Email', exact: true })).toHaveAttribute(
		'aria-invalid',
		'true'
	);
	await expect(dialog.getByRole('alert')).toBeVisible();
	await expect(dialog).toBeVisible();
	expect(createRequests).toBe(0);
	await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('valid@example.com');
	await expect(dialog.getByRole('textbox', { name: 'Email', exact: true })).toHaveAttribute(
		'aria-invalid',
		'false'
	);
	await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('product editor uses one field column on a phone and retains accessible pricing controls', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard/);
	await page.getByRole('link', { name: 'Stock', exact: true }).click();
	await page.getByRole('button', { name: 'New product', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('group', { name: 'Pricing', exact: true })).toBeVisible();
	await expect(dialog.getByRole('textbox', { name: 'Price', exact: true })).toBeAttached();
	await expect(dialog.getByRole('textbox', { name: 'Cost', exact: true })).toBeAttached();
	const [priceBox, costBox] = await dialog.evaluate((node) =>
		['p-price', 'p-cost'].map((id) => {
			const bounds = node.querySelector(`#${id}`)!.getBoundingClientRect();
			return { x: bounds.x, y: bounds.y, height: bounds.height };
		})
	);
	expect(priceBox.height).toBeGreaterThanOrEqual(44);
	expect(costBox.y).toBeGreaterThan(priceBox.y);
	expect(Math.abs(costBox.x - priceBox.x)).toBeLessThan(2);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

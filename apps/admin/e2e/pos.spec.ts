import { expect, test } from '@playwright/test';

/**
 * Critical workflow: sign in, open the POS, add a product, charge it, and see
 * the order appear. Run with the seeded demo tenant (owner@demo.test).
 */
test('cashier can sign in and complete a POS sale', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('owner@demo.test');
	await page.getByLabel('Password', { exact: true }).fill('Password123');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL(/\/dashboard/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');

	await page.getByRole('link', { name: 'POS', exact: true }).click();
	await expect(page).toHaveURL(/\/pos/);

	// Add the first available product, then charge.
	await page.getByRole('button', { name: 'Cola 500ml Rs 150', exact: true }).click();
	await page.getByRole('button', { name: 'Charge', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Take Rs 174', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Take Rs 174', exact: true }).click();

	await expect(page.getByText('Paid Rs 174', { exact: true })).toBeVisible();

	await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
	await expect(page.locator('.sales-chart')).toBeVisible();
	await expect(page.getByText('This week', { exact: true }).locator('..')).toContainText(
		/Rs\s+[1-9]/
	);
	await page.getByRole('link', { name: 'Orders', exact: true }).click();
	await expect(page.getByRole('table')).toBeVisible();
});

test('cashier can hold, resume and reopen ticket notes after Escape', async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard/);
	await page.getByRole('link', { name: 'POS', exact: true }).click();
	await page.getByRole('button', { name: 'Cola 500ml Rs 150', exact: true }).click();
	await page.keyboard.press('F8');
	await page.getByRole('button', { name: 'Held tickets (1)', exact: true }).click();
	await page.getByRole('button', { name: 'Resume', exact: true }).click();
	await expect(page.getByRole('button', { name: 'One more Cola 500ml' })).toBeVisible();
	await page.getByRole('button', { name: 'Add notes', exact: true }).click();
	await page.getByLabel('Instructions').fill('Serve chilled');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Edit notes', exact: true }).click();
	await expect(page.getByLabel('Instructions')).toHaveValue('Serve chilled');
});

test('mobile cashier can reach the ticket and navigate without page overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard/);
	await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
	await page.getByRole('link', { name: 'POS', exact: true }).click();
	await page.getByRole('button', { name: 'Cola 500ml Rs 150', exact: true }).click();
	await page.getByRole('link', { name: /View ticket/ }).click();
	await expect(page.getByRole('button', { name: 'Charge', exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('cashier menus preserve selected labels and command search supports keyboard navigation', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard/);
	await page.getByRole('link', { name: 'POS', exact: true }).click();
	await page.getByRole('tab', { name: 'Drinks', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Cola 500ml Rs 150', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Beef Steak Rs 1,450', exact: true })).toHaveCount(
		0
	);
	await page.getByRole('button', { name: 'Sort menu', exact: true }).click();
	await page.getByRole('option', { name: 'Name A–Z', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Sort menu', exact: true })).toContainText(
		'Name A–Z'
	);
	await page.getByRole('button', { name: 'Customer', exact: true }).click();
	await page.getByRole('option', { name: 'Ali Raza', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Customer', exact: true })).toContainText(
		'Ali Raza'
	);
	await page.keyboard.press('Control+k');
	await page
		.getByRole('combobox', { name: 'Search pages and actions', exact: true })
		.fill('Inventory');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/inventory/);
});

test('catalog edit sheets open from row menus and restore focus after Escape', async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard/);
	await page.getByRole('link', { name: 'Catalog', exact: true }).click();
	const actions = page.getByRole('button', { name: 'Actions for Beef Steak', exact: true });
	await actions.click();
	await page.getByRole('menuitem', { name: 'Edit product', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Beef Steak');
	await page.getByLabel('Category', { exact: true }).click();
	await page.getByRole('option', { name: 'Mains', exact: true }).click();
	await expect(page.getByLabel('Category', { exact: true })).toContainText('Mains');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(actions).toBeFocused();
});

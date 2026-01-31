
import { test, expect } from '@playwright/test';

test('Smoke Test: Settings Page', async ({ page }) => {
  await page.goto('http://localhost:3000/settings');
  // Use heading to avoid ambiguity with sidebar link
  await expect(page.getByRole('heading', { name: /Settings/ })).toBeVisible();
  // Check for Scanner Status section
  await expect(page.getByText('Scanner Status')).toBeVisible();
  // Check for Start Scanner button specifically
  await expect(page.getByRole('button', { name: 'Start Scanner' })).toBeVisible();
});

test('Smoke Test: Pairs Management & Edit', async ({ page }) => {
  await page.goto('http://localhost:3000/pairs');
  await expect(page.getByRole('heading', { name: 'Pairs Management' })).toBeVisible();
  
  // Check if any pair exists, if so click Edit
  const editButtons = page.getByRole('button', { name: 'Edit' });
  const count = await editButtons.count();
  
  if (count > 0) {
      await editButtons.first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('Edit Pair #')).toBeVisible();
      // Close dialog
      await page.keyboard.press('Escape');
  } else {
      console.log('No pairs to edit, skipping edit test');
  }
});

test('Smoke Test: Evaluation Log Links', async ({ page }) => {
  await page.goto('http://localhost:3000/opportunities');
  
  // Check for Open PM / Open KH links
  // This depends on data existing.
  const pmLink = page.getByText('Open PM');
  if (await pmLink.count() > 0) {
      // Use .first() to avoid strict mode error if multiple links exist
      const href = await pmLink.first().getAttribute('href');
      expect(href).toContain('polymarket.com');
  }
});

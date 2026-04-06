import { test, expect } from '@playwright/test'

/**
 * Auth redirect tests — verify unauthenticated users are sent to /login.
 * These intentionally do NOT mock auth so the Supabase client finds no session.
 */
test.describe('Auth redirects', () => {
  test('unauthenticated visit to /dashboard redirects to /login', async ({ page }) => {
    // Intercept Supabase session call to return no session
    await page.route('**/auth/v1/user', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    )
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to /tax redirects to /login', async ({ page }) => {
    await page.route('**/auth/v1/user', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    )
    await page.goto('/tax')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to /insights redirects to /login', async ({ page }) => {
    await page.route('**/auth/v1/user', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    )
    await page.goto('/insights')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/login page shows email and password fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByPlaceholder(/email/i)).toBeVisible()
    await expect(page.getByPlaceholder(/password/i)).toBeVisible()
  })
})

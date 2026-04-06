import { test, expect } from '@playwright/test'
import { mockSupabaseAuth, mockAIAnalyzeAPI, mockPortfolioAPI } from './fixtures/api-mocks'

test.describe('AI Insights page', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuth(page)
    await mockPortfolioAPI(page)
  })

  test('analyze button triggers POST and shows summary', async ({ page }) => {
    await mockAIAnalyzeAPI(page)
    await page.goto('/insights')
    await page.getByRole('button', { name: /analyze|re-analyze/i }).click()
    await expect(page.getByText(/well-diversified/i)).toBeVisible()
  })

  test('shows health score stats after analysis', async ({ page }) => {
    await mockAIAnalyzeAPI(page)
    await page.goto('/insights')
    await page.getByRole('button', { name: /analyze|re-analyze/i }).click()
    await expect(page.getByText('85')).toBeVisible()
  })

  test('shows tax savings when opportunities exist', async ({ page }) => {
    await mockAIAnalyzeAPI(page)
    await page.goto('/insights')
    await page.getByRole('button', { name: /analyze|re-analyze/i }).click()
    await expect(page.getByText(/\$20/)).toBeVisible()
  })

  test('analyze button disabled or shows loading during request', async ({ page }) => {
    await mockAIAnalyzeAPI(page, 500)  // 500ms delay
    await page.goto('/insights')
    await page.getByRole('button', { name: /analyze|re-analyze/i }).click()
    // During the delay, button should be in a loading/disabled state
    const btn = page.getByRole('button', { name: /analyz/i })
    await expect(btn).toBeDisabled()
  })

  test('API error shows retry card', async ({ page }) => {
    await page.route('**/api/v1/ai/analyze', route => route.abort())
    await page.goto('/insights')
    await page.getByRole('button', { name: /analyze|re-analyze/i }).click()
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
  })
})

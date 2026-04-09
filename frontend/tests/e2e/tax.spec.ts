import { test, expect } from '@playwright/test'
import { mockSupabaseAuth, mockTaxAPI } from './fixtures/api-mocks'

test.describe('Tax Savings page', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuth(page)
  })

  test('shows opportunity card with symbol and savings', async ({ page }) => {
    await mockTaxAPI(page)
    await page.goto('/tax')
    await expect(page.getByText('JNJ')).toBeVisible()
    await expect(page.getByText(/\$20/).first()).toBeVisible()
  })

  test('shows summary stats', async ({ page }) => {
    await mockTaxAPI(page)
    await page.goto('/tax')
    // opportunity count shown somewhere
    await expect(page.getByText('1', { exact: true }).first()).toBeVisible()
  })

  test('urgent badge shown when urgency is high', async ({ page }) => {
    await mockTaxAPI(page, {
      opportunities: [{
        symbol: 'JNJ', sector: 'Healthcare', shares: 5,
        purchase_date: '2025-05-20', purchase_price: 180, current_price: 160,
        cost_basis: 900, current_value: 800, unrealized_loss: 100,
        tax_savings_estimate: 20, is_short_term: true, days_held: 340,
        days_until_lt: 25, holding_period_label: 'Short-term',
        tax_rate_used: 0.37, replacement_suggestion: 'VHT',
        urgency: 'high',
      }],
      summary: { total_harvestable_loss: 100, total_tax_savings_estimate: 20, opportunity_count: 1, short_term_count: 1, long_term_count: 0, urgent_count: 1 },
      has_lots: true,
    })
    await page.goto('/tax')
    await expect(page.getByText(/harvest soon/i)).toBeVisible()
  })

  test('no opportunities message when list is empty', async ({ page }) => {
    await mockTaxAPI(page, {
      opportunities: [],
      summary: { total_harvestable_loss: 0, total_tax_savings_estimate: 0, opportunity_count: 0, short_term_count: 0, long_term_count: 0, urgent_count: 0 },
      has_lots: true,
    })
    await page.goto('/tax')
    await expect(page.getByText(/no harvesting opportunities/i)).toBeVisible()
  })

  test('import transactions prompt when no lots', async ({ page }) => {
    await mockTaxAPI(page, { has_lots: false, opportunities: [], summary: {} })
    await page.goto('/tax')
    await expect(page.getByText(/import.*transactions/i).first()).toBeVisible()
  })

  test('API error shows retry card', async ({ page }) => {
    await page.route('**/api/v1/tax/opportunities', route => route.abort())
    await page.goto('/tax')
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
  })
})

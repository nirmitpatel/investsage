import { test, expect } from '@playwright/test'
import {
  mockSupabaseAuth, mockPortfolioAPI, mockRefreshPricesAPI, mockStylePatchAPI,
  mockRecommendAPI,
  MOCK_HEALTH, MOCK_POSITIONS,
} from './fixtures/api-mocks'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuth(page)
  })

  test('loads portfolio data and shows score + positions', async ({ page }) => {
    await mockPortfolioAPI(page)
    await page.goto('/dashboard')

    // Health score visible
    await expect(page.getByText('85')).toBeVisible()
    await expect(page.getByText('B', { exact: true })).toBeVisible()

    // Position rows visible
    await expect(page.getByText('AAPL')).toBeVisible()
    await expect(page.getByText('JNJ')).toBeVisible()
  })

  test('shows investment style badge in header', async ({ page }) => {
    await mockPortfolioAPI(page)
    await page.goto('/dashboard')
    await expect(page.getByText(/beat the market/i).first()).toBeVisible()
  })

  test('shows style modal when investment_style is null', async ({ page }) => {
    await mockPortfolioAPI(page, {
      portfolio: { id: 'port-1', investment_style: null, last_import_at: null },
      health: { ...MOCK_HEALTH, investment_style: null },
    })
    await page.goto('/dashboard')
    await expect(page.getByText(/what's your investment style/i)).toBeVisible()
  })

  test('style modal has 3 options', async ({ page }) => {
    await mockPortfolioAPI(page, {
      portfolio: { id: 'port-1', investment_style: null, last_import_at: null },
      health: { ...MOCK_HEALTH, investment_style: null },
    })
    await page.goto('/dashboard')
    await expect(page.getByText(/play it safe/i)).toBeVisible()
    await expect(page.getByText(/beat the market/i)).toBeVisible()
    await expect(page.getByText(/long game/i)).toBeVisible()
  })

  test('selecting style closes modal and updates score', async ({ page }) => {
    await mockPortfolioAPI(page, {
      portfolio: { id: 'port-1', investment_style: null, last_import_at: null },
      health: { ...MOCK_HEALTH, investment_style: null },
    })
    await mockStylePatchAPI(page, 'long_game')
    await page.goto('/dashboard')

    // Click "Long game" option
    await page.getByText(/long game/i).first().click()
    // Modal should close
    await expect(page.getByText(/what's your investment style/i)).not.toBeVisible()
  })

  test('empty portfolio shows no positions state', async ({ page }) => {
    await mockPortfolioAPI(page, { positions: [], health: { ...MOCK_HEALTH, position_count: 0 } })
    await page.goto('/dashboard')
    await expect(page.getByText(/no positions yet/i)).toBeVisible()
  })

  test('API error shows retry card', async ({ page }) => {
    await page.route('**/api/v1/portfolio', route => route.abort())
    await page.goto('/dashboard')
    await expect(page.getByText(/failed to load portfolio/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
  })

  test('sector breakdown panel visible with sector names', async ({ page }) => {
    await mockPortfolioAPI(page)
    await page.goto('/dashboard')
    await expect(page.getByText('Technology').first()).toBeVisible()
    await expect(page.getByText('Healthcare').first()).toBeVisible()
  })

  test('refresh prices button triggers API call', async ({ page }) => {
    await mockPortfolioAPI(page)
    await mockRefreshPricesAPI(page)
    await page.goto('/dashboard')

    let refreshCalled = false
    page.on('request', req => {
      if (req.url().includes('refresh-prices')) refreshCalled = true
    })

    await page.getByRole('button', { name: /refresh/i }).click()
    await page.waitForTimeout(500)
    expect(refreshCalled).toBe(true)
  })

  test('health issue card shows when issues present', async ({ page }) => {
    await mockPortfolioAPI(page, {
      health: {
        ...MOCK_HEALTH,
        issues: [{ type: 'sector_concentration', severity: 'high', message: 'Technology is 65% of portfolio.' }],
      },
    })
    await page.goto('/dashboard')
    await expect(page.getByText('Technology is 65% of portfolio.')).toBeVisible()
  })

  test('AI recommendation popover shows on hover after Ask AI clicked', async ({ page }) => {
    await mockPortfolioAPI(page)
    await mockRecommendAPI(page, 'AAPL')
    await page.goto('/dashboard')

    // Click Ask AI for AAPL — badge should appear
    await page.getByRole('button', { name: /ask ai/i }).first().click()
    const badge = page.getByRole('button', { name: /hold/i }).first()
    await expect(badge).toBeVisible()

    // Hover the badge — popover opens after 150 ms delay
    await badge.hover()
    await expect(page.getByText('Stock is performing well but already a large position.')).toBeVisible()
  })

  test('AI recommendation popover stays within viewport', async ({ page }) => {
    // Use a small viewport so the last row is near the bottom edge
    await page.setViewportSize({ width: 1280, height: 500 })
    await mockPortfolioAPI(page)
    await mockRecommendAPI(page, 'AAPL')
    await mockRecommendAPI(page, 'JNJ')
    await page.goto('/dashboard')

    // Trigger both recommendations so both badges render (click sequentially — each click
    // replaces the "Ask AI" button with a badge, so re-query first() each time)
    await page.getByRole('button', { name: /ask ai/i }).first().click()
    await expect(page.getByRole('button', { name: /hold/i }).first()).toBeVisible()
    await page.getByRole('button', { name: /ask ai/i }).first().click()
    // Wait for both badges
    await expect(page.getByRole('button', { name: /hold/i }).first()).toBeVisible()

    // Scroll to the bottom so the last badge is near the viewport edge
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    // Hover the last badge — popover must not overflow below the viewport
    const badges = page.getByRole('button', { name: /hold/i })
    const lastBadge = badges.last()
    await lastBadge.hover()
    const popover = page.locator('.bg-\\[\\#13131f\\]').last()
    await expect(popover).toBeVisible()

    const box = await popover.boundingBox()
    expect(box).not.toBeNull()
    // Popover bottom must be within viewport (position:fixed escapes overflow containers)
    expect(box!.y + box!.height).toBeLessThanOrEqual(500 + 2) // 2px tolerance
  })

  test('AI recommendation popover shows reasoning when sector trend is unavailable', async ({ page }) => {
    await mockPortfolioAPI(page)
    await mockRecommendAPI(page, 'AAPL', {
      recommendation: 'HOLD',
      confidence: 'LOW',
      reasoning: 'No sector trend data available to confirm momentum.',
      key_factors: ['sector trend unavailable', 'position is underweight'],
    })
    await page.goto('/dashboard')

    await page.getByRole('button', { name: /ask ai/i }).first().click()
    const badge = page.getByRole('button', { name: /hold/i }).first()
    await expect(badge).toBeVisible()

    await badge.hover()
    // Reasoning must render even without sector data — not a blank or broken popover
    await expect(page.getByText('No sector trend data available to confirm momentum.')).toBeVisible()
    await expect(page.getByText('sector trend unavailable')).toBeVisible()
  })

  test('upload positions CSV shows success message', async ({ page }) => {
    await mockPortfolioAPI(page)
    await page.route('**/api/v1/portfolio/import/positions', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ imported: 2, positions: MOCK_POSITIONS, health: MOCK_HEALTH }),
      })
    })
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /import csv/i }).first().click()

    // Use file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /upload positions/i }).click(),
    ])
    await fileChooser.setFiles({
      name: 'positions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Symbol,Quantity\nAAPL,10'),
    })
    await expect(page.getByText(/imported 2 positions/i)).toBeVisible()
  })
})

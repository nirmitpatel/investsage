import type { Page } from '@playwright/test'

// ── Shared mock data ───────────────────────────────────────────────────────

export const MOCK_POSITIONS = [
  {
    symbol: 'AAPL', description: 'APPLE INC', total_shares: 10,
    current_price: 150, current_value: 1500, total_cost_basis: 1200,
    total_gain_loss: 300, total_gain_loss_percent: 25, percent_of_account: 60,
    sector: 'Technology',
  },
  {
    symbol: 'JNJ', description: 'JOHNSON & JOHNSON', total_shares: 5,
    current_price: 160, current_value: 800, total_cost_basis: 900,
    total_gain_loss: -100, total_gain_loss_percent: -11.1, percent_of_account: 40,
    sector: 'Healthcare',
  },
]

export const MOCK_HEALTH = {
  score: 85, grade: 'B', total_value: 2300, total_gain_loss: 200,
  position_count: 2, issues: [], notes: [],
  sector_breakdown: [
    { sector: 'Technology', value: 1500, pct: 65.2 },
    { sector: 'Healthcare', value: 800, pct: 34.8 },
  ],
  investment_style: 'beat_the_market',
  market_trends_period: '3-month',
}

export const MOCK_PORTFOLIO_RESPONSE = {
  portfolio: { id: 'port-1', investment_style: 'beat_the_market', last_import_at: null },
  positions: MOCK_POSITIONS,
  health: MOCK_HEALTH,
}

export const MOCK_TAX_RESPONSE = {
  has_lots: true,
  opportunities: [
    {
      symbol: 'JNJ', sector: 'Healthcare', shares: 5,
      purchase_date: '2024-01-15', purchase_price: 180, current_price: 160,
      cost_basis: 900, current_value: 800, unrealized_loss: 100,
      tax_savings_estimate: 20, is_short_term: true, days_held: 180,
      days_until_lt: 185, holding_period_label: 'Short-term',
      tax_rate_used: 0.37, replacement_suggestion: 'VHT (Vanguard Health Care ETF)',
      urgency: null,
    },
  ],
  summary: {
    total_harvestable_loss: 100, total_tax_savings_estimate: 20,
    opportunity_count: 1, short_term_count: 1, long_term_count: 0, urgent_count: 0,
  },
}

export const MOCK_AI_ANALYZE_RESPONSE = {
  summary: 'Your portfolio is well-diversified with strong Technology exposure driving gains.',
  health: { ...MOCK_HEALTH },
  tax_summary: { opportunity_count: 1, total_tax_savings_estimate: 20, total_harvestable_loss: 100 },
}

// ── Route interceptors ─────────────────────────────────────────────────────

/** Mock Supabase auth to return a valid session — prevents redirect to /login.
 *
 * Sets window.__E2E_TOKEN__ via addInitScript so that the getToken() utility
 * in lib/supabase.ts returns a fake token without needing real Supabase cookies.
 */
export async function mockSupabaseAuth(page: Page) {
  await page.addInitScript(() => {
    (window as any).__E2E_TOKEN__ = 'fake-access-token'
  })
}

/** Mock the Railway backend API */
export async function mockPortfolioAPI(page: Page, overrides?: Partial<typeof MOCK_PORTFOLIO_RESPONSE>) {
  await page.route('**/api/v1/portfolio', route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_PORTFOLIO_RESPONSE, ...overrides }),
      })
    } else {
      route.fallback()
    }
  })
}

export async function mockRefreshPricesAPI(page: Page) {
  await page.route('**/api/v1/portfolio/refresh-prices', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ positions: MOCK_POSITIONS, health: MOCK_HEALTH }),
    })
  })
}

export async function mockStylePatchAPI(page: Page, newStyle: string) {
  await page.route('**/api/v1/portfolio', route => {
    if (route.request().method() === 'PATCH') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ health: { ...MOCK_HEALTH, investment_style: newStyle } }),
      })
    } else {
      route.fallback()
    }
  })
}

export async function mockTaxAPI(page: Page, overrides?: object) {
  await page.route('**/api/v1/tax/opportunities', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...MOCK_TAX_RESPONSE, ...overrides }),
    })
  })
}

export async function mockAIAnalyzeAPI(page: Page, delay = 0) {
  await page.route('**/api/v1/ai/analyze', async route => {
    if (delay) await new Promise(r => setTimeout(r, delay))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AI_ANALYZE_RESPONSE),
    })
  })
}

export async function mockRecommendAPI(
  page: Page,
  symbol: string,
  payload: object = {
    recommendation: 'HOLD',
    confidence: 'MEDIUM',
    reasoning: 'Stock is performing well but already a large position.',
    key_factors: ['25% gain', '60% of portfolio'],
  },
) {
  await page.route(`**/api/v1/ai/position/${symbol}/recommend`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

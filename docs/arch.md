# InvestSage — Architecture Reference

## Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS — static export (`output: 'export'`) → GitHub Pages
  - `basePath: '/investsage'` in prod only (`NODE_ENV === 'production'`)
  - `NEXT_PUBLIC_BASE_PATH=/investsage` set in GitHub Actions for reset-password redirect URL
- **Backend**: FastAPI (Python) → Railway. All sync work wrapped in `asyncio.to_thread()`.
- **Auth/DB**: Supabase — JWT passed as `Bearer` token. Backend uses service key (bypasses RLS).
- **Market data**: yfinance (prices, sectors, fund weightings, ETF performance)
- **AI**: Anthropic Claude API — Haiku (`claude-haiku-4-5-20251001`) for fast calls, Sonnet (`claude-sonnet-4-6`) for full analysis

## Env vars
### Frontend (`.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` — Railway backend URL in prod
- `NEXT_PUBLIC_BASE_PATH` — `/investsage` in prod, empty locally

### Backend
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `ANTHROPIC_API_KEY`
- `ALLOWED_ORIGINS` — comma-separated CORS origins

## Backend routes
```
GET  /health
GET  /api/v1/portfolio
PATCH /api/v1/portfolio                   — save investment_style, re-score health
POST /api/v1/portfolio/import/positions   — upload positions CSV
POST /api/v1/portfolio/import/transactions — upload transactions CSV, reconstruct tax lots
POST /api/v1/portfolio/refresh-prices
GET  /api/v1/tax/opportunities
POST /api/v1/tax/opportunities/{symbol}/explain
POST /api/v1/ai/analyze                   — full analysis (Sonnet)
POST /api/v1/ai/position/{symbol}/recommend — Sell/Hold/Buy (Haiku)
GET  /api/v1/analytics                    — SPY comparison, performers, sector P&L
```

## DB tables (Supabase)
- `portfolios` — `id`, `user_id`, `investment_style`, `last_import_at`
- `positions` — `portfolio_id`, `symbol`, `description`, `sector`, `current_price`, `current_value`, `total_cost_basis`, `total_gain_loss`, `total_gain_loss_percent`, `percent_of_account`, `total_shares`
- `tax_lots` — `user_id`, `symbol`, `acquisition_date`, `shares`, `cost_basis_per_share`, `term` (`short`/`long`)

## Frontend pages & components
```
app/
  page.tsx              — Marketing landing page
  login/page.tsx        — Sign in / Sign up / Forgot password
  reset-password/       — Handles Supabase recovery token
  dashboard/page.tsx    — Portfolio overview, health score, positions table
  tax/page.tsx          — Tax-loss harvesting opportunities
  insights/page.tsx     — On-demand AI portfolio analysis
  analytics/page.tsx    — SPY comparison, performers, sector P&L

components/
  Sidebar.tsx           — Shared sidebar nav
  SectorBreakdownPanel.tsx — Donut chart + sector legend
  PositionsTable.tsx    — Positions table with AI rec button
```

## Key business logic
- **Health score**: 0–100, graded A≥90 / B≥75 / C≥60 / D≥45 / F<45
- **Investment styles**: `play_it_safe` (1y trends), `beat_the_market` (3mo), `long_game` (2y)
- **Sector expansion**: `build_effective_sector_values()` expands ETF/fund positions into underlying sectors via yfinance `sectorWeightings`; unknown funds → "Other"
- **Tax savings rates**: 37% short-term, 20% long-term federal marginal
- **Tax lot reconstruction**: FIFO from transactions CSV; stored in `tax_lots`; `position_id` nullable
- **Notes vs Issues**: `issues` reduce health score; `notes` are informational only

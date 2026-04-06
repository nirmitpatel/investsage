# InvestSage — Next Steps

_Say "execute next" to run the top unchecked item. This file is updated after every completed or discovered task._

---

## P0 — Blockers (must fix before sharing)

- [x] Error/loading states on tax, insights, analytics pages — retry cards matching dashboard
- [x] Analytics page empty state — prompt to import when no positions
- [x] **Verify Railway deployment** — confirm `POST /api/v1/ai/position/{symbol}/recommend` and `GET /api/v1/analytics` are live; trigger manual redeploy if needed
- [x] **Fix AI recommendation parsing** — strip markdown code fences from Claude response before JSON.loads; fix fallback that hardcodes `HOLD` even when Claude's text says SELL
- [x] **Fix Ask AI tooltip** — replace `title` attribute (shows raw JSON) with a proper popover showing reasoning + key factors
- [x] **Clear stale recs on style change** — `handleSelectStyle` never calls `setRecommendations({})`; old Buy/Hold/Sell badges persist after mode switch
- [x] **Fix sector donut color mismatch** — DonutChart renders `breakdown[]` order but legend renders `ordered[]` (Other moved to end); indices drift when Other is mid-array, causing dot/segment color mismatch
- [ ] **Ask AI never recommends BUY** — the `/recommend` prompt only receives static snapshot data (gain %, value, sector) with no forward-looking signals; Claude has no basis to suggest buying more; enrich prompt with sector trend (from `market_trends`), whether position is underweight vs portfolio allocation, and investment style so it can reason about upside
- [ ] **Rec popover: hover instead of click** — requires two separate clicks (Ask AI → open popover); switch to hover/focus-triggered display with a short delay so the reasoning appears on mouseover without an extra click
- [ ] **Rec popover goes off-screen** — popover always opens downward; for positions near the bottom of the table it clips below the viewport; detect trigger position relative to viewport and flip upward when needed
- [ ] **Ask AI for all positions button** — no way to bulk-fetch; add a "Ask AI for all" button in the Positions table header that fires `/recommend` for every position sequentially with a small delay between calls to avoid hammering the API

---

## P1 — Polish & UX

- [ ] **Session expiry handling** — 401 mid-session should redirect to `/login` with "Session expired" message (currently silent across all pages)
- [ ] **Mobile layout** — positions table overflows on phones; need horizontal scroll wrapper + responsive sidebar (hamburger or bottom nav)
- [ ] **Upload progress indicator** — positions import takes ~30s; add step labels ("Fetching prices… Fetching sectors…") to reduce abandonment
- [ ] **AI recommendation error state** — if `POST /recommend` fails in PositionsTable, button silently does nothing; show inline error
- [ ] **Long game trend period** — change from `2y` to `10y` in `STYLE_TREND_PERIOD`; yfinance supports it
- [ ] **Play it safe trend period** — change from `1y` to `3y`; update modal description to reflect "3–5 year stability focus" rather than short-term trends
- [ ] **Sector table readability** — color dot and name are misaligned when sector names are long; add dotted leader or row background stripe so the eye can track from name to allocation %
- [ ] **Sector donut hover tooltip** — static SVG today; add per-segment `onMouseEnter`/`onMouseLeave` with overlay showing sector name, allocation %, and trend
- [ ] **Per-day change column in positions table** — fetch `previousClose` via yfinance on price refresh; add "Day" column showing today's $ and % change per position

---

## P2 — Features

- [ ] **Multi-brokerage CSV support** — currently Fidelity only; add Schwab and Vanguard parsers (different column names/formats)
- [ ] **Portfolio history snapshots** — store point-in-time snapshots to enable a value-over-time chart on analytics
- [ ] **Email digest notifications** — weekly "your health score changed" or "new tax opportunity" email
- [ ] **Shareable portfolio report** — one-click PDF or read-only shareable link for dashboard snapshot
- [ ] **Mode-aware health scoring** — currently `market_trends` data is fetched but never used in scoring; penalize heavy allocation in sectors with negative trend for beat-the-market/play-it-safe; reward underweight allocation in outperforming sectors
- [ ] **Capture account type from Fidelity CSV** — `Account Name/Number` column is parsed but discarded; detect `401k`, `Roth 401(k)`, `Individual`, `IRA` etc. from the value; store `account_type` on positions; use it to split personal vs retirement views
- [ ] **Account-aware AI recommendations** — suppress Buy/Hold/Sell for 401k positions (can't freely trade plan funds); replace with rebalancing suggestions within available fund options
- [ ] **401k retirement alignment scoring** — collect retirement year from user profile; compare actual 401k equity/bond split against expected glide path for that target year; surface as a dedicated health card separate from personal portfolio score
- [ ] **Smart tax-loss harvest + reallocation** — when surfacing a harvest opportunity, cross-reference sector weight and trend: if sector is already overweight or underperforming, suggest redeploying proceeds into an underweight outperforming sector rather than buying a replacement in-kind; if sector is healthy and underweight, suggest a better-performing peer stock (e.g. MSFT instead of CRM) or a sector ETF for the 30-day wash-sale window, with clear explanation of why
- [ ] **Brokerage-appropriate wash sale alternatives** — replace Vanguard-only ETF suggestions with Fidelity-native funds (FTEC, FHLC, FSKAX, etc.) or universal SPDR/iShares equivalents; detect brokerage from CSV account name
- [ ] **AI Insights page overhaul** — pass investment style to Claude with mode-specific instructions (not just a label); expand page beyond one summary card — add action items section, per-sector commentary, and risk summary cards
- [ ] **Analytics: clarify missing period comparisons** — 1-month and 1-year "Your Portfolio" rows are absent because no historical snapshots exist; add explanatory note and link to the snapshots feature

---

## P3 — Hardening

- [ ] **Rate limiting on AI endpoints** — `/analyze` and `/recommend` call Claude API; add per-user rate limits to control cost
- [ ] **Backend error monitoring** — add Sentry (or similar) to Railway deployment for visibility into 500s
- [ ] **`.env.local.example` audit** — ensure all required vars are documented for a clean local setup

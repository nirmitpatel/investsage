# InvestSage — Next Steps

_Say "execute next" to run the top unchecked item. Completed tasks are auto-stripped by hook._

---

## P1 — High Value, Foundational Gaps

---

## P2 — Features

### Sell/Hold/Buy Analyzer Completion

### Execution Plan Generator (Feature 3B — not started)
- [ ] **Execution plan backend** — new endpoint `GET /api/v1/analysis/execution-plan`; takes all SELL recommendations + tax opportunities; produces ordered sequence: sells first (ranked by tax savings), then buys (ranked by conviction + sizing need); verifies cash flow never goes negative; flags wash sale windows; tracks holding period deadlines
- [ ] **Execution plan UI** — new page or modal showing the plan as a step-by-step timeline; each action shows proceeds/cost and running cash balance; wash sale notes and holding period warnings inline; interactive checklist for marking steps complete

### Portfolio Simulation and Before/After Tracker (Feature 3C — not started)
- [ ] **Schema: recommendation_outcomes + ai_training_feedback** — add two missing tables from design: `recommendation_outcomes` (tracks actual vs shadow portfolio value at 30/60/90/180/365 day intervals) and `ai_training_feedback` (records outcome correctness, factor scores, sector, market condition for AI learning loop)
- [ ] **Persist AI recommendations** — write to `recommendation_snapshots` on every `/recommend` call; include `price_at_recommendation`, `shares_at_recommendation`, `value_at_recommendation`, `factors_at_time`, `combined_score`
- [ ] **Shadow portfolio tracking** — on each recommendation, snapshot position; at 30/60/90/180/365 day checkpoints, compare actual portfolio vs simulated "did nothing" path; `track_recommendation_outcome()` algorithm fully specified in design
- [ ] **Value dashboard** — UI showing: recommendations followed (count, $ gained vs shadow, tax savings captured), recommendations ignored (missed opportunity framing), lifetime value summary (total $ InvestIQ added vs subscription cost)
- [ ] **Recommendation follow-through UI** — let user mark a recommendation as "followed" or "ignored" on the dashboard; drives shadow portfolio comparison

### Smart Money & Congressional Trades (Feature 4 — not started)
- [ ] **Ingest congressional trades** — fetch STOCK Act disclosures from Capitol Trades API or Senate EFTS; daily scan; populate `smart_money_trades` with `trader_type='congress'`, party/state/committee in `trader_detail`; normalize symbols
- [ ] **Ingest hedge fund 13F filings** — fetch quarterly SEC EDGAR XBRL filings for top 20 funds; parse position changes quarter over quarter; populate `smart_money_trades` with `trader_type='hedge_fund'`
- [ ] **Ingest insider transactions (Form 4)** — fetch executive buy/sell via SEC EDGAR API within 2 business days; populate `smart_money_trades` with `trader_type='insider'`
- [ ] **Backend: smart money routes** — `GET /api/v1/smart-money/congress`, `/hedge-funds`, `/overlap` (trades matching user's held symbols), `/follow`, `POST /follow/{id}`, `DELETE /follow/{id}`
- [ ] **Dashboard: smart money overlap alert** — surface a card when congress members or insiders have recently traded positions the user holds; show trader name, party/committee, trade date, amount range, disclosure lag
- [ ] **Smart Money page** — dedicated page listing all trades for held symbols; filterable by trader type, buy/sell, recency; link to original disclosure source; follow feature for specific politicians or fund managers

### Policy Impact Alerts (Feature 5 — not started)
- [ ] **Policy-stock mapping database** — hardcode initial `POLICY_IMPACTS` dict per design (CHIPS Act → NVDA/AMD/INTC, IRA Drug Pricing → LLY/NVO/MRK, Defense Auth → PLTR/AXON/LMT, etc.); `check_policy_impact()` algorithm specified
- [ ] **Ingest policy events** — fetch pending/passed legislation from Congress.gov API; Fed calendar for rate decisions; daily scan; AI-classify impact direction and magnitude; populate `policy_events`
- [ ] **Backend: policy routes** — `GET /api/v1/policy/events`, `/alerts` (filtered to user's holdings), `/impact/{symbol}`
- [ ] **Insights: policy risk cards** — surface policy events on Insights page as risk/opportunity cards per affected position; show event name, status (pending/passed/failed), impact direction, magnitude

### Tax Enhancements
- [ ] **Ordinary income offset calculator** — show benefit of the $3,000 capital loss deduction against CD interest, rental income, or other ordinary income; requires `has_other_income` + `other_income_types` on user profile (FR-TAX-008)
- [ ] **Year-end harvest countdown** — starting November 1, show a countdown banner on the Tax page with days remaining to harvest and total available savings at stake (FR-TAX-009)
- [ ] **Tax report export** — export tax lots, harvested losses, and savings summary as CSV or PDF for the user's CPA (FR-TAX-010)
- [ ] **Smart tax-loss harvest + reallocation** — cross-reference sector weight and trend when surfacing opportunities; suggest redeploying into underweight outperforming sectors or peer stocks; explain wash-sale window
- [ ] **Brokerage-appropriate wash sale alternatives** — replace generic ETF suggestions with brokerage-native funds (Fidelity: FTEC/FHLC/FSKAX, Vanguard: VTSAX, universal: SPDR/iShares); detect brokerage from `portfolios.brokerage`

### Portfolio & Analytics
- [ ] **AI Insights page overhaul** — pass investment style with mode-specific instructions; expand beyond one summary card — add action items, per-sector commentary, and risk summary cards
- [ ] **Analytics: clarify missing period comparisons** — add explanatory note when 1-month/1-year portfolio rows are absent (no snapshots yet)

### Accounts & Profile
- [ ] **User profile page** — collect federal tax bracket, state tax bracket, has_other_income + types, retirement year; store on user record; gates tax bracket calculations, 401k glide path, and ordinary income offset features
- [ ] **401k retirement alignment scoring** — use retirement year from profile; compare actual 401k equity/bond split against expected glide path; surface as a dedicated health card
- [ ] **Store brokerage at portfolio level** — `portfolios.brokerage` column exists but is never written; set from CSV import; use in wash-sale alternative suggestions

---

## P3 — Advanced Features (Phase 4)

- [ ] **Options Strategy Builder** — cash-secured put finder (input cash, rank puts by annualized return, filter earnings-crossing options); covered call optimizer for 100+ share positions; collateral calculator; assignment simulator; options income tracker (FR-OPT-001 through FR-OPT-008)
- [ ] **RSU and DRIP Manager** — RSU vesting date tracker with tax impact at user bracket; sell-to-cover vs cash withholding comparison; DRIP status monitor per position; auto-investment tracker detecting paused recurring investments; cash flow calendar combining all sources (FR-RSU-001 through FR-RSU-006)
- [ ] **Document export** — export execution plans, tax reports, and quarterly portfolio reviews as PDF (FR-EXE-011, FR-TAX-010)

---

## P4 — Hardening

- [ ] **Calculation audit log** — add `calculation_audit_log` table (append-only, SHA-256 hashed input/output, algorithm version); write a row for every tax scan, health score, and recommendation; 7-year retention for IRS alignment; regulatory protection if tax savings claims are ever questioned
- [ ] **Rate limiting on AI endpoints** — `/analyze` and `/recommend` call Claude API; add per-user rate limits to control cost
- [ ] **Backend error monitoring** — add Sentry to Railway deployment for visibility into 500s
- [ ] **`.env.local.example` audit** — ensure all required vars are documented for a clean local setup
- [ ] **Email digest notifications** — weekly "your health score changed" or "new tax opportunity" email
- [ ] **Update `arch.md`** — add smart money + policy routes, execution plan endpoint, value dashboard page, sub-grade health score, and user profile page once built

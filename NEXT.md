# InvestSage — Next Steps

_Say "execute next" to run the top unchecked item. Completed tasks are auto-stripped by hook._

---

## P2 — Features

- [ ] **Email digest notifications** — weekly "your health score changed" or "new tax opportunity" email
- [ ] **Shareable portfolio report** — one-click PDF or read-only shareable link for dashboard snapshot
- [ ] **Capture account type from Fidelity CSV** — `Account Name/Number` column is parsed but discarded; detect `401k`, `Roth 401(k)`, `Individual`, `IRA` etc.; store `account_type` on positions; use it to split personal vs retirement views
- [ ] **Account-aware AI recommendations** — suppress Buy/Hold/Sell for 401k positions; replace with rebalancing suggestions within available fund options
- [ ] **401k retirement alignment scoring** — collect retirement year from user profile; compare actual 401k equity/bond split against expected glide path; surface as a dedicated health card
- [ ] **Smart tax-loss harvest + reallocation** — cross-reference sector weight and trend when surfacing harvest opportunities; suggest redeploying into underweight outperforming sectors or peer stocks; explain wash-sale window
- [ ] **Brokerage-appropriate wash sale alternatives** — replace Vanguard-only ETF suggestions with Fidelity-native funds (FTEC, FHLC, FSKAX) or universal SPDR/iShares equivalents; detect brokerage from CSV account name
- [ ] **AI Insights page overhaul** — pass investment style with mode-specific instructions; expand beyond one summary card — add action items, per-sector commentary, and risk summary cards
- [ ] **Analytics: clarify missing period comparisons** — add explanatory note when 1-month/1-year portfolio rows are absent (no snapshots yet); link to snapshots feature

---

## P3 — Hardening

- [ ] **Persist AI recommendations to `recommendation_snapshots`** — table and schema already defined; write a row on every `/recommend` call
- [ ] **Drop unused schema tables** — `smart_money_trades` and `policy_events` were never built; remove from `schema.sql` and add a `DROP TABLE IF EXISTS` migration comment
- [ ] **Rate limiting on AI endpoints** — `/analyze` and `/recommend` call Claude API; add per-user rate limits to control cost
- [ ] **Backend error monitoring** — add Sentry (or similar) to Railway deployment for visibility into 500s
- [ ] **`.env.local.example` audit** — ensure all required vars are documented for a clean local setup

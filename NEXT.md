# InvestSage — Next Steps

_Say "execute next" to run the top unchecked item. This file is updated after every completed or discovered task._

---

## P0 — Blockers (must fix before sharing)

- [x] Error/loading states on tax, insights, analytics pages — retry cards matching dashboard
- [x] Analytics page empty state — prompt to import when no positions
- [ ] **Verify Railway deployment** — confirm `POST /api/v1/ai/position/{symbol}/recommend` and `GET /api/v1/analytics` are live; trigger manual redeploy if needed

---

## P1 — Polish & UX

- [ ] **Session expiry handling** — 401 mid-session should redirect to `/login` with "Session expired" message (currently silent across all pages)
- [ ] **Mobile layout** — positions table overflows on phones; need horizontal scroll wrapper + responsive sidebar (hamburger or bottom nav)
- [ ] **Upload progress indicator** — positions import takes ~30s; add step labels ("Fetching prices… Fetching sectors…") to reduce abandonment
- [ ] **AI recommendation error state** — if `POST /recommend` fails in PositionsTable, button silently does nothing; show inline error

---

## P2 — Features

- [ ] **Multi-brokerage CSV support** — currently Fidelity only; add Schwab and Vanguard parsers (different column names/formats)
- [ ] **Portfolio history snapshots** — store point-in-time snapshots to enable a value-over-time chart on analytics
- [ ] **Email digest notifications** — weekly "your health score changed" or "new tax opportunity" email
- [ ] **Shareable portfolio report** — one-click PDF or read-only shareable link for dashboard snapshot

---

## P3 — Hardening

- [ ] **Rate limiting on AI endpoints** — `/analyze` and `/recommend` call Claude API; add per-user rate limits to control cost
- [ ] **Backend error monitoring** — add Sentry (or similar) to Railway deployment for visibility into 500s
- [ ] **`.env.local.example` audit** — ensure all required vars are documented for a clean local setup

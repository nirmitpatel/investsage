# InvestSage — Next Steps

_I update this file at the end of each work session. Tell me to "do next" and I'll execute the top item._

---

## P0 — Must do before sharing widely

- [ ] **Error/loading states on tax, insights, analytics pages** — currently they fail silently. Add retry cards like dashboard has.
- [ ] **Verify Railway deployment** — confirm `POST /api/v1/ai/position/{symbol}/recommend` and `GET /api/v1/analytics` are live (added this session, Railway may need a manual redeploy).

---

## P1 — Polish & UX

- [ ] **Mobile layout** — positions table overflows on phones. At minimum: horizontal scroll wrapper + responsive sidebar (hamburger or bottom nav).
- [ ] **Session expiry handling** — if JWT expires mid-session, API calls return 401 silently. Should redirect to `/login` with a "session expired" message.
- [ ] **Upload progress/feedback** — positions import takes ~30s (yfinance). The button text changes but there's no visual progress. A step indicator ("fetching prices… fetching sectors…") would reduce abandonment.
- [ ] **Analytics page empty state** — if no positions imported, analytics shows nothing. Add a prompt to import first.

---

## P2 — Features

- [ ] **Multi-brokerage support** — currently Fidelity CSV only. Schwab and Vanguard have different CSV formats.
- [ ] **Portfolio comparison over time** — right now everything is point-in-time. Storing historical snapshots would enable a chart.
- [ ] **Email notifications** — "your portfolio health changed" or "new tax opportunity found" weekly digest.
- [ ] **Shareable portfolio report** — one-click PDF or shareable link for a snapshot of the dashboard.

# InvestSage — Claude Guide

## Stack
Next.js 14 + TypeScript + Tailwind (GitHub Pages); FastAPI (Railway); Supabase JWT auth.

## Rules
- Auth: always pass `Bearer` token; 401 on load → `/login`; 401 mid-session → `/login?reason=session_expired`
- UI: dark `#0a0a0f` bg, `white/[0.04]` cards, violet accents; error states = retry card (icon + heading + "Try again")
- Mark tasks done in `NEXT.md` (`- [ ]` → `- [x]`) — hook auto-strips them after save

## Key files
- `docs/arch.md` — architecture, routes, DB schema
- `NEXT.md` — open tasks
- `supabase/schema.sql` — DB schema

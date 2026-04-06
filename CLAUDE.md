# InvestSage — Claude Guide

## Rules
- Next.js 14 + TypeScript + Tailwind frontend (GitHub Pages static export); FastAPI backend (Railway)
- Auth via Supabase JWT — always pass `Bearer` token; 401 → redirect to `/login`
- Match existing UI patterns: dark `#0a0a0f` bg, `white/[0.03]` cards, violet accents
- Error states must show a retry card (icon + heading + "Try again" button) — never fail silently
- **Update NEXT.md** when a task is completed (`- [ ]` → `- [x]`) or a new task is discovered

## Key files
- Architecture, stack, routes, DB schema: `docs/arch.md`
- Task list & priorities: `NEXT.md`
- DB schema SQL: `supabase/schema.sql`

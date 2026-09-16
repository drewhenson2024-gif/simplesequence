# Breakout: self-improving sequences + Analytics

**Status:** Analytics chrome shipped (`/analytics`, nav, homepage example). Rule-based suggestions + Save as new draft are live. AI copy (C) and A/B (B) still parked. Do not fake rates. Never auto-rewrite a running sequence.

**Decision (Drew, 15 Sep 2026):** A new **Analytics** page in the app nav, not a tab tucked on a sequence. Features should look finished. Unusable (empty / Coming soon) is fine. Fake rates are not.

**Product promise:** each run has stats for what worked and what didn’t. An AI reads those analytics and suggests the next draft. Suggestions never mutate a running sequence and never auto-start.

## Do not steer with “cost”

Build time, file count, and “cost: high / medium / small” are not a product veto and not a reason to recommend one approach over another. If the finished design has a page or loop, we ship that chrome. We still refuse fake data and auto-send.

## Page spec (fleshed out)

App nav: People · Sequences · Inbox · **Analytics** · Settings

`/analytics` is a workspace board:

1. **Totals** — runs, people enrolled, sent, skipped, failed, replies, reply rate, restricted. Zeros when nothing has sent.
2. **Runs** — every campaign as a row (name, status, sent, replies, reply rate, skips, last activity). Click through to that sequence.
3. **Selected run** — per-step table: sent, skipped (by reason), failed, replies, reply rate. “What worked / what didn’t” in plain language from those numbers.
4. **Suggestions** — cards beside the board. Rule-based from the numbers when data exists (`suggest_learnings` already does a thin version). “AI draft from these stats” is Coming soon until a model/MCP path is wired. **Save as new draft** stays draft-only (`apply_learnings`).

Homepage: Analytics can have an in-page example. Open app still does not happen from that card.

## What already exists (wire this, don’t rebuild)

Jobs: queued / sent / skipped / failed + skip reasons. Inbox replies. `suggest_learnings` / `apply_learnings` (new draft only). Outbox and Learnings tabs can stay; Analytics is the board.

## AI later (not a reason to skip the page)

- **A (now):** suggestions from the numbers. No model.
- **B:** A/B bodies on a step; board compares them.
- **C:** agent reads the stats payload and proposes copy. Human saves a new draft. You Start.
- **D:** auto-rewrite a running sequence — never.

## Out of scope for this page

- Fake charts / demo reply rates
- People search / Signals watcher
- Changing Start / sandbox / MCP auto-send

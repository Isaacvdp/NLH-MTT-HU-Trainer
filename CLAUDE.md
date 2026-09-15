# Hold'em MTT Spot Trainer

A private two-player sandbox for practicing tournament No-Limit Hold'em spots (e.g. BTN vs BB) with configurable stacks, blinds, antes, table size, and positions. Only two humans play, but the hand is set up as if it came from a full table: folded blinds and antes are dead money in the pot.

## Core concept

This is NOT standard heads-up poker. Positions come from a simulated full table:
- Preflop, the player in the earlier position (e.g. BTN) acts first; the BB acts last.
- Postflop, the player closer to the left of the button acts first (the BB acts first vs the BTN).
- Dead money is added to the starting pot based on the spot:
  - Folded blinds: SB's blind is dead in BTN vs BB; SB's blind is dead in CO vs BB, etc.
  - Big blind ante: the BB posts one ante for the table (dead, not part of the BB's live bet).
  - Per-player ante: every seat (table size) antes; the two live players' antes come from their stacks, the rest are dead.
- SB vs BB: SB completes/raises/folds preflop, then acts first postflop.

## Stack

- Monorepo (pnpm workspaces), TypeScript everywhere
- `packages/engine`: pure TS, no dependencies on UI or Supabase, fully unit-tested with Vitest
- `apps/web`: React + Vite, deployed to Netlify
- `supabase/`: migrations, RLS policies, Edge Functions (Deno), importing the engine
- Supabase anonymous auth to identify the two players
- Supabase Realtime (postgres changes) for public game state

## Security model (server is authoritative)

- The client never receives the deck or the opponent's hole cards before showdown.
- `decks` table: no client access (RLS denies all; only service role in Edge Functions).
- `hole_cards` table: RLS allows select only where `player_id = auth.uid()`.
- `game_state` table: public to room members; contains pot, board, stacks, bets, action-to, legal action info, history.
- All actions go through Edge Functions that validate with the engine. Shuffle with `crypto.getRandomValues` (Fisher–Yates).
- At showdown (or when "reveal after hand" is enabled), both hands are written to `game_state`.

## Engine requirements

- Card/deck types, shuffling (injectable RNG for tests)
- Spot setup: table size (2–9), live positions, blinds, ante type (none / BB ante / per-player), stacks per player (chips or BB, fixed or random range)
- Betting rounds: fold, check, call, bet, raise, all-in
- Min-raise rules; a short all-in raise does not reopen action for a player who already acted
- Correct handling when a player cannot cover the blind/ante (partial post, all-in)
- Uncalled bet returned; no side pots needed (only two players)
- Showdown with hand evaluation (write a tested evaluator or use `pokersolver` via npm)
- Split pots, odd chip rule
- Pure state transitions: `applyAction(state, action) -> state`, plus `legalActions(state)`
- Hand history output (PokerStars-like text format is a plus for solver import)

Write thorough tests first, especially for: dead money totals, action order pre/postflop per spot, min-raise edge cases, short all-ins, uncalled bets, and splits.

## Features

- Create room -> share link -> friend joins
- Setup screen: spot preset, table size, blinds/ante, stacks, "swap seats each hand", "reveal hands after hand", "reset stacks each hand" vs "carry stacks over"
- Table: two seats, board, pot, bets, stacks in chips and BB, action log
- Bet sizing buttons: min, 2x, 2.5x, 33%/50%/75%/pot, all-in, plus a custom input
- Hand history viewer and copy/export

## Design

Simple and clean. Muted dark background, one quiet flat felt color, sans-serif type, large readable cards, generous spacing. No gradients, 3D chips, or casino styling. Mobile-friendly.

## Build order

1. `packages/engine` with full test coverage
2. Local hot-seat mode in `apps/web` using the engine directly (no backend) to verify spots and UI
3. Supabase schema, RLS, anonymous auth, Edge Functions (`create_room`, `join_room`, `start_hand`, `act`)
4. Wire the web app to Supabase Realtime; remove hot-seat dependence on local state
5. Deploy: Netlify for web, `supabase functions deploy` for functions
6. CI: GitHub Action running engine tests

Work in small, testable steps. Run tests after engine changes.

## Repository & version control

- Hosted in a private GitHub repo (created manually by the owner).
- Commit in small, logical steps with clear messages. Default branch: `main`.
- Use feature branches + pull requests for non-trivial changes so Netlify deploy previews can be tested before merging.
- The owner may add a friend as a collaborator; keep the README clear enough to run the project locally.

## Secrets & environment variables

- Never commit secrets. The Supabase **service role key** must only exist in Edge Function secrets (`supabase secrets set`) and never in frontend code, env files in the repo, or logs.
- Frontend uses only the Supabase project URL and anon key, read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Provide `apps/web/.env.example` with placeholder values; real values live in `.env.local` (git-ignored) and Netlify environment variables.
- `.gitignore` must include at least: `node_modules`, `dist`, `.env`, `.env.local`, `.env.*.local`, `supabase/.temp`, `supabase/.branches`, `.netlify`, `coverage`, `.DS_Store`.

## Deployment

- **Netlify**: connected to the GitHub repo; pushes to `main` deploy production, PRs get deploy previews.
  - Base directory: `apps/web`
  - Build command: `pnpm build` (ensure the workspace engine package builds first)
  - Publish directory: `apps/web/dist`
  - Add a `netlify.toml` with an SPA redirect (`/* -> /index.html 200`) so room links work on refresh.
- **Supabase**: migrations in `supabase/migrations`, deployed with `supabase db push`; functions with `supabase functions deploy`.
- Free tier note: Supabase free projects pause after about a week of inactivity and must be resumed from the dashboard.

## CI

- GitHub Action (`.github/workflows/test.yml`) on push and pull request:
  - Install with pnpm (cached)
  - Typecheck all packages
  - Run engine tests (`pnpm --filter engine test`)
- A failing engine test should block merging.

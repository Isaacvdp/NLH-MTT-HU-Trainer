# Hold'em MTT Spot Trainer

A private two-player sandbox for drilling tournament No-Limit Hold'em spots — BTN vs BB,
CO vs BB, SB vs BB and so on — with configurable stacks, blinds, antes and table size.

Only two people play, but the hand is dealt as if it had come out of a full table: the
seats that folded leave their blinds and antes behind as dead money, and the action order
is the one those two seats would really have.

## What makes it different from heads-up poker

- **Preflop**, the earlier seat acts first (BTN acts before BB).
- **Postflop**, the first seat to the left of the button acts first (BB acts before BTN).
  At a 2-handed table the small blind *is* the button, so the big blind acts first postflop.
- **Dead money** goes into the starting pot: folded blinds, and antes from every seat that
  is not in the hand.

## Layout

```
packages/engine    pure TypeScript rules engine, no UI or network dependencies
apps/web           React + Vite front end
supabase/          migrations, RLS policies and Edge Functions
```

## Running it locally

Requires Node 20+ and pnpm 10+.

```bash
npm install -g pnpm     # if you do not have it
pnpm install
pnpm test               # engine unit tests
pnpm dev                # web app on http://localhost:5173
```

Other useful scripts:

```bash
pnpm -r typecheck       # typecheck every package
pnpm --filter engine test:watch
pnpm build              # build the engine, then the web app
```

## The engine

`packages/engine` is the source of truth for the rules and has no dependencies. The same
code runs in the browser for local hot-seat play and inside Supabase Edge Functions for
online play, so both agree on what is legal.

```ts
import { buildSpot, createHand, legalActions, applyAction, handHistory } from 'engine';

const config = buildSpot({
  tableSize: 9,
  positions: ['BTN', 'BB'],
  bigBlind: 100,
  anteType: 'bb',
  stacks: [2500, 2500],
});

let state = createHand(config);        // shuffles with crypto.getRandomValues
legalActions(state);                   // { types: ['fold','call','raise','all-in'], ... }
state = applyAction(state, { type: 'raise', to: 250 });
console.log(handHistory(state));       // PokerStars-style text
```

Key points:

- `applyAction` is pure: it clones the state, applies one action, deals any streets that
  follow, and settles the hand when it ends.
- Bets are capped at the **effective stack**, so you can never bet more than the opponent
  can call. Anything uncalled is returned at the end of the betting round.
- Antes are taken **before** blinds, so a player who cannot cover both posts the ante first.
- Split pots give the odd chip to the first seat left of the button.
- Only two players are ever in a hand, so there are no side pots. In the very rare case
  where a live player is all-in for less than a folded seat's dead contribution, that
  player is still eligible for the whole pot.

Hand histories are written with the folded seats included as real seats that post and fold,
so the dead money is attributable and the text imports into solvers and trackers.

## Testing

```bash
pnpm test               # everything
pnpm --filter engine test
pnpm --filter web test
```

The engine suite covers dead-money totals for every spot and ante type, action order per
street, min-raise rules, short all-ins that do not reopen the action, partial blind posts,
uncalled bets, split pots and the odd chip, plus randomised play over thousands of hands
checking that chips are always conserved and every hand terminates.

The web suite renders the real app in jsdom and plays hands through the buttons: dealing,
the sizing bar, folding, swapping seats and running an all-in out to showdown.

## Hot-seat mode

`pnpm dev` gives you local two-player practice with no backend — the engine runs in the
browser. Set the spot up, deal, and pass the device back and forth; by default only the
player to act can see their cards. Supabase-backed online play is the next step.

## Environment

The web app reads only the public Supabase values:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill them in. The service role key
lives only in Supabase Edge Function secrets and must never appear in the repo.

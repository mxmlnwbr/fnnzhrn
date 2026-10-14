# Depot

Live at **https://depot.fnnzhrn.ch**.

A personal dashboard for tracking the performance of your share portfolio and your cash. Prices and FX rates come from Yahoo Finance.

## Features

- **Several depots**: keep each broker account (or any other split) as its own depot, with its own transactions, cash accounts, base currency and targets. Switch, add, rename and delete depots from the menu under the title. Export and Import work on the depot shown. **All depots** adds them up into one view with its own base currency and rebalance targets; transactions and cash are edited in their own depot, and changing a position's asset class there changes it in every depot.
- Record **buy**, **sell** and **dividend** transactions, with fees and withholding tax, and **custody fees** (Depotgebühren) charged for the account. Custody fees count against total return and show in the fees card; Swissquote imports bring them in too. Symbol search runs against Yahoo Finance, so SIX tickers like `NESN.SW` and `NOVN.SW` work, as do US, LSE and XETRA ones.
- **Holdings** show average cost, the current price, today's change, market value, unrealized P/L and portfolio weight.
- **Import from your bank**: Swissquote transaction exports and Yuh activity exports (CSV) become transactions and dividends, with tickers checked against Yahoo Finance. A report after each import lists anything that didn't come through. Yuh exports have no balances, so add Yuh cash by hand.
- **Cash accounts** track your liquidity: add each bank or broker account with its currency and current balance, and edit the balance when it changes. Balances are converted to the base currency and added to your net worth. Importing a Swissquote CSV fills in the account's latest cash balance per currency.
- **Summary cards** show net worth (shares plus cash), today's change, unrealized P/L, and total return (unrealized + realized + dividends).
- The **performance chart** plots daily market value against net invested capital, with 1M / 3M / YTD / 1Y / All ranges. The period return excludes deposits and uses the simple Dietz method.
- **Multi-currency**: pick CHF, EUR, USD or GBP as the base currency. Positions are converted at current FX rates, and history at historical FX rates. LSE prices quoted in pence (GBp) are normalised to GBP.
- **Sign-in required**: the tracker only opens once you sign in with your email (a sign-in link, no password). The API routes check the session too, so prices, search and imports don't work for signed-out visitors.
- **Sync across devices**: your depots are saved to your account in a Neon Postgres database and load on every device you sign in on. The browser keeps a local copy, so the app opens instantly and edits made offline upload later. Use **Export** / **Import** to back them up as JSON.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command             | Description                   |
| ------------------- | ----------------------------- |
| `npm run dev`       | Start the dev server          |
| `npm run build`     | Production build              |
| `npm start`         | Serve the production build    |
| `npm test`          | Unit tests (Vitest)           |
| `npm run lint`      | ESLint                        |
| `npm run typecheck` | TypeScript type check         |

## How it works

```
src/
  app/
    page.tsx               Dashboard (client component), shown only when signed in
    api/quotes/route.ts    Current quotes   GET /api/quotes?symbols=AAPL,NESN.SW
    api/history/route.ts   Daily closes     GET /api/history?symbols=...&from=YYYY-MM-DD
    api/search/route.ts    Symbol search    GET /api/search?q=nestle
    api/auth/[...all]/     Sign-in with email links (Better Auth)
    api/portfolio/route.ts The signed-in user's depots   GET / PUT /api/portfolio
  lib/
    yahoo.ts               Server-only Yahoo Finance wrapper (yahoo-finance2)
    portfolio.ts           Position, P/L and history calculations (average-cost method)
    storage.ts             localStorage persistence and account sync
    swissquote.ts          Swissquote CSV import, and ticker guessing shared by the imports
    yuh.ts                 Yuh CSV import
    sync.ts                Depot store format and merge rules for signed-out data on sign-in
    auth.ts, db.ts         Server-only Better Auth setup and Neon connection pool
    auth-client.ts         Browser side of sign-in
    useMarketData.ts       Fetches quotes, FX and history for the current transactions
  components/              UI
db/schema.sql              Database tables for sign-in and sync
```

Yahoo Finance is called only from the server-side API routes, because the library does not work in the browser.

### Notes and limitations

- Cost basis uses the **average-cost** method. Realized P/L, dividends and cost basis are converted to the base currency at **current** FX rates. Only the performance chart uses historical FX.
- Cash is tracked as current balances, not as a history of deposits and withdrawals, so the performance chart and returns cover shares only.
- Enter amounts in the share's trading currency, e.g. USD for `AAPL` and GBP (not pence) for `VOD.L`.
- Yahoo Finance is an unofficial data source. Data may be delayed, and delisted symbols lose their history.

## Deploying

The app is a standard Next.js project and deploys to Vercel as-is. It needs the sign-in settings below: without them it stays locked on a screen saying sign-in isn't set up.

### Custom domain

The app runs at `depot.fnnzhrn.ch`:

1. In Vercel, open the project → **Settings → Domains** and add `depot.fnnzhrn.ch`.
2. At the registrar for `fnnzhrn.ch`, add the DNS record Vercel shows (a `CNAME` for `depot` pointing to Vercel).
3. Set `BETTER_AUTH_URL` to `https://depot.fnnzhrn.ch` (see below), so sign-in links open the new domain.

## Sign-in and sync

Sign-in and sync need three services, all with free tiers that are plenty for personal use: [Neon](https://neon.tech) (Postgres) stores your depots, [Better Auth](https://better-auth.com) handles sign-in inside the app, and [Resend](https://resend.com) sends the sign-in emails. One-time setup:

1. **Create the database.** In Vercel, open the project → **Storage** → **Create Database** → **Neon**, and connect it to this project. This adds `DATABASE_URL` to the project's environment variables. (Or create a project at neon.tech and add its pooled connection string as `DATABASE_URL` yourself.)
2. **Create the tables.** In the Neon console, open **SQL Editor**, paste [`db/schema.sql`](db/schema.sql) and run it (or `psql "$DATABASE_URL" -f db/schema.sql`). It's safe to run again.
3. **Set up email.** Create a Resend account and an API key, and add it as `RESEND_API_KEY`. To send from your own address, verify `fnnzhrn.ch` under **Domains** in Resend and set `EMAIL_FROM`, e.g. `Depot <login@fnnzhrn.ch>`. Without it, Resend's test sender is used, which only delivers to the email of your Resend account. That's enough if you're the only user.
4. **Add the auth settings.** Set `BETTER_AUTH_SECRET` to a random value (`openssl rand -base64 32`) and `BETTER_AUTH_URL` to `https://depot.fnnzhrn.ch`.
5. **Redeploy** on Vercel so the new variables are built in. The app only opens when `DATABASE_URL`, `BETTER_AUTH_SECRET` and `RESEND_API_KEY` are all set.

For local development, copy `.env.example` to `.env.local` and fill in the same values, with `BETTER_AUTH_URL=http://localhost:3000`.

How sync behaves:

- The first time you sign in on a browser, anything left there from before sign-in was required (or unsaved when you signed out) is merged into your account (matched by depot, transaction and cash account id).
- All depots sync. Which depot is shown is remembered per device.
- Every change uploads right away. When you come back to the tab, it pulls the latest version, so edits from your phone show up on your computer.
- If both devices change the portfolio while one is offline, the last one to upload wins.
- Signing out removes the portfolio from that browser. It stays in your account. Sessions last a year and renew while you use the app.
- Sign-in links work once and expire after 15 minutes.

### Moving from Supabase

Sync used to run on Supabase. Accounts don't carry over, but your data does, through the browser: open the updated app in a browser that has your synced copy and sign in with the new setup. That copy is uploaded to your new account, and every other device gets it when you sign in there. Once that's done, the Supabase project and its `NEXT_PUBLIC_SUPABASE_*` variables can be deleted.

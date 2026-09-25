# Portfolio Tracker

A personal dashboard for tracking the performance of your share portfolio and your cash. Prices and FX rates come from Yahoo Finance.

## Features

- Record **buy**, **sell** and **dividend** transactions, with fees and withholding tax. Symbol search runs against Yahoo Finance, so SIX tickers like `NESN.SW` and `NOVN.SW` work, as do US, LSE and XETRA ones.
- **Holdings** show average cost, the current price, today's change, market value, unrealized P/L and portfolio weight.
- **Cash accounts** track your liquidity: add each bank or broker account with its currency and current balance, and edit the balance when it changes. Balances are converted to the base currency and added to your net worth. Importing a Swissquote CSV fills in the account's latest cash balance per currency.
- **Summary cards** show net worth (shares plus cash), today's change, unrealized P/L, and total return (unrealized + realized + dividends).
- The **performance chart** plots daily market value against net invested capital, with 1M / 3M / YTD / 1Y / All ranges. The period return excludes deposits and uses the simple Dietz method.
- **Multi-currency**: pick CHF, EUR, USD or GBP as the base currency. Positions are converted at current FX rates, and history at historical FX rates. LSE prices quoted in pence (GBp) are normalised to GBP.
- **Sync across devices** (optional): sign in with your email (a sign-in link, no password) and your portfolio is saved to your account in Supabase and loads on every device you sign in on. The browser keeps a local copy, so the app opens instantly and edits made offline upload later.
- **Local-first storage**: without sign-in, your transactions stay in your browser's `localStorage`. Use **Export** / **Import** to back them up as JSON.

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
    page.tsx               Dashboard (client component)
    api/quotes/route.ts    Current quotes   GET /api/quotes?symbols=AAPL,NESN.SW
    api/history/route.ts   Daily closes     GET /api/history?symbols=...&from=YYYY-MM-DD
    api/search/route.ts    Symbol search    GET /api/search?q=nestle
  lib/
    yahoo.ts               Server-only Yahoo Finance wrapper (yahoo-finance2)
    portfolio.ts           Position, P/L and history calculations (average-cost method)
    storage.ts             localStorage persistence and account sync
    sync.ts                Merge rules for signed-out data on sign-in
    supabase.ts            Browser Supabase client (null when not configured)
    useMarketData.ts       Fetches quotes, FX and history for the current transactions
  components/              UI
supabase/schema.sql        Database table and access rules for sync
```

Yahoo Finance is called only from the server-side API routes, because the library does not work in the browser.

### Notes and limitations

- Cost basis uses the **average-cost** method. Realized P/L, dividends and cost basis are converted to the base currency at **current** FX rates. Only the performance chart uses historical FX.
- Cash is tracked as current balances, not as a history of deposits and withdrawals, so the performance chart and returns cover shares only.
- Enter amounts in the share's trading currency, e.g. USD for `AAPL` and GBP (not pence) for `VOD.L`.
- Yahoo Finance is an unofficial data source. Data may be delayed, and delisted symbols lose their history.

## Deploying

The app is a standard Next.js project and deploys to Vercel as-is. Without the Supabase settings below it runs in local-only mode: the sign-in button is hidden, and your data never leaves your browser, apart from the ticker symbols sent to fetch prices.

## Sync across devices

Sign-in and sync use [Supabase](https://supabase.com) (the free tier is plenty). One-time setup:

1. **Create the project.** In Vercel, open the project → **Storage** → **Create Database** → **Supabase**, and connect it to this project. This adds `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the project's environment variables. (Or create a project at supabase.com and add `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from **Project Settings → API Keys** yourself; see `.env.example`.)
2. **Create the table.** In the Supabase dashboard, open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql) and run it. Row-level security limits every user to their own row.
3. **Allow your URL.** Under **Authentication → URL Configuration**, set **Site URL** to your Vercel URL and add `http://localhost:3000` to the redirect URLs for local development.
4. **Redeploy** on Vercel so the new variables are built in.

For local development, copy `.env.example` to `.env.local` and fill in the same two values.

How sync behaves:

- The first time you sign in on a browser, anything you entered there while signed out is merged into your account (matched by transaction and cash account id).
- Every change uploads right away. When you come back to the tab, it pulls the latest version, so edits from your phone show up on your computer.
- If both devices change the portfolio while one is offline, the last one to upload wins.
- Signing out removes the portfolio from that browser. It stays in your account.
- Supabase's built-in email service sends only a few emails per hour, and only to members of your Supabase organisation. That's fine for personal use; connect your own SMTP provider under **Authentication → Emails** to sign in other people.

# Portfolio Tracker

A personal dashboard for tracking the performance of your share portfolio. Prices and FX rates come from Yahoo Finance.

## Features

- Record **buy**, **sell** and **dividend** transactions, with fees and withholding tax. Symbol search runs against Yahoo Finance, so SIX tickers like `NESN.SW` and `NOVN.SW` work, as do US, LSE and XETRA ones.
- **Holdings** show average cost, the current price, today's change, market value, unrealized P/L and portfolio weight.
- **Summary cards** show market value, today's change, unrealized P/L, and total return (unrealized + realized + dividends).
- The **performance chart** plots daily market value against net invested capital, with 1M / 3M / YTD / 1Y / All ranges. The period return excludes deposits and uses the simple Dietz method.
- **Multi-currency**: pick CHF, EUR, USD or GBP as the base currency. Positions are converted at current FX rates, and history at historical FX rates. LSE prices quoted in pence (GBp) are normalised to GBP.
- **Local-first storage**: your transactions stay in your browser's `localStorage`. Use **Export** / **Import** to back them up as JSON or move them between devices.

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
    storage.ts             localStorage persistence
    useMarketData.ts       Fetches quotes, FX and history for the current transactions
  components/              UI
```

Yahoo Finance is called only from the server-side API routes, because the library does not work in the browser.

### Notes and limitations

- Cost basis uses the **average-cost** method. Realized P/L, dividends and cost basis are converted to the base currency at **current** FX rates. Only the performance chart uses historical FX.
- Enter amounts in the share's trading currency, e.g. USD for `AAPL` and GBP (not pence) for `VOD.L`.
- Yahoo Finance is an unofficial data source. Data may be delayed, and delisted symbols lose their history.

## Deploying

The app is a standard Next.js project and deploys to Vercel as-is. Your data never leaves your browser, apart from the ticker symbols sent to fetch prices.

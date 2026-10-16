# fnnzhrn

**https://fnnzhrn.ch**, the home of a group of friends interested in finance. One Next.js app holds the public site and the members-only tools:

| Path | What | Access |
| --- | --- | --- |
| `/` | Landing page (Swiss German copy) | public |
| `/login` | One sign-in for all tools (email link, no password) | public |
| `/depot` | Depot: portfolio tracker for shares and cash | signed in |
| `/cockpit` | Cockpit: market dashboard (depot, markets, news, opportunities) | signed in |
| `/budget` | Finanzen: income, fixed costs and how much of it to invest | signed in |

The Depot used to be a separate repository on `depot.fnnzhrn.ch`. Its full history is merged into this one, and the old subdomain redirects to `/depot`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in, see "Sign-in" below
npm run dev                  # http://localhost:3000
```

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
  proxy.ts                 Sends signed-out visitors of /depot, /budget and /cockpit to /login
  app/
    page.tsx, site.css     Landing page (styles scoped to .site)
    login/page.tsx         Sign-in page; ?next= is where to go afterwards
    depot/                 Depot dashboard (client component)
    cockpit/route.ts       Serves cockpit.html to signed-in users
    cockpit/cockpit.html   Cockpit page (plain HTML/JS, data from /api/cockpit/*)
    budget/                Finanzen page (loads the budget on the server)
    api/auth/[...all]/     Sign-in with email links (Better Auth)
    api/portfolio, api/profile          The signed-in user's depots and profile
    api/quotes, history, search, resolve Depot market data (yahoo-finance2)
    api/cockpit/*          Cockpit data (see below)
    api/budget             The signed-in user's financial overview
  lib/
    auth.ts, db.ts, session.ts  Server-only Better Auth setup, Neon pool, session helpers
    auth-client.ts         Browser side of sign-in
    cockpit/               Cockpit data sources; screens.ts defines markets and screens, screener.ts runs them on Yahoo
    budget.ts              Financial overview: data model and totals
    budget-store.ts, budget-seeds.ts  Loading and saving it; spreadsheets imported per account
    portfolio.ts, storage.ts, sync.ts, swissquote.ts, yuh.ts, ...  Depot logic
  components/              Depot UI; site/ holds the landing and sign-in components
db/schema.sql              Database tables for sign-in, depots and budgets
```

Every tool route checks the session on the server: the proxy only does a fast cookie check and redirects, while `/cockpit`, all `/api/*` routes except sign-in, and the depot sync verify the session themselves and answer 401 (or redirect) otherwise.

## Sign-in

Sign-in needs three services, all with free tiers: [Neon](https://neon.tech) (Postgres) stores accounts and depots, [Better Auth](https://better-auth.com) handles sign-in inside the app, and [Resend](https://resend.com) sends the sign-in emails.

1. **Database.** In Vercel, open the project → **Storage** → connect the Neon database. This sets `DATABASE_URL`. For a new database, run [`db/schema.sql`](db/schema.sql) in Neon's SQL editor (safe to run again).
2. **Email.** Add a Resend API key as `RESEND_API_KEY`. To send from your own address, verify `fnnzhrn.ch` in Resend and set `EMAIL_FROM`, e.g. `fnnzhrn <login@fnnzhrn.ch>`.
3. **Auth settings.** Set `BETTER_AUTH_SECRET` to a random value (`openssl rand -base64 32`) and `BETTER_AUTH_URL` to `https://fnnzhrn.ch`.
4. **Redeploy**, so the variables are built in. The tools only open when `DATABASE_URL`, `BETTER_AUTH_SECRET` and `RESEND_API_KEY` are all set; otherwise `/login` says sign-in isn't set up.

Sign-in links work once and expire after 15 minutes. Sessions last a year and renew while the tools are used.

## Depot

### Features

- **Several depots**: keep each broker account (or any other split) as its own depot, with its own transactions, cash accounts, base currency and targets. Switch, add, rename and delete depots from the menu under the title. Export and Import work on the depot shown. **All depots** adds them up into one view with its own base currency and rebalance targets; transactions and cash are edited in their own depot, and changing a position's asset class there changes it in every depot.
- Record **buy**, **sell** and **dividend** transactions, with fees and withholding tax, and **custody fees** (Depotgebühren) charged for the account. Custody fees count against total return and show in the fees card; Swissquote imports bring them in too. Symbol search runs against Yahoo Finance, so SIX tickers like `NESN.SW` and `NOVN.SW` work, as do US, LSE and XETRA ones.
- **Holdings** show average cost, the current price, today's change, market value, unrealized P/L and portfolio weight.
- **Import from your bank**: Swissquote transaction exports and Yuh activity exports (CSV) become transactions and dividends, with tickers checked against Yahoo Finance. A report after each import lists anything that didn't come through. Yuh exports have no balances, so add Yuh cash by hand.
- **Cash accounts** track your liquidity: add each bank or broker account with its currency and current balance, and edit the balance when it changes. Balances are converted to the base currency and added to your net worth. Importing a Swissquote CSV fills in the account's latest cash balance per currency.
- **Summary cards** show net worth (shares plus cash), today's change, unrealized P/L, and total return (unrealized + realized + dividends).
- The **performance chart** plots daily market value against net invested capital, with 1M / 3M / YTD / 1Y / All ranges. The period return excludes deposits and uses the simple Dietz method.
- **Multi-currency**: pick CHF, EUR, USD or GBP as the base currency. Positions are converted at current FX rates, and history at historical FX rates. LSE prices quoted in pence (GBp) are normalised to GBP.
- **Sync across devices**: your depots are saved to your account in a Neon Postgres database and load on every device you sign in on. The browser keeps a local copy, so the app opens instantly and edits made offline upload later. Use **Export** / **Import** to back them up as JSON.

How sync behaves:

- The first time you sign in on a browser, anything left there from before sign-in was required (or unsaved when you signed out) is merged into your account (matched by depot, transaction and cash account id).
- All depots sync. Which depot is shown is remembered per device.
- Every change uploads right away. When you come back to the tab, it pulls the latest version, so edits from your phone show up on your computer.
- If both devices change the portfolio while one is offline, the last one to upload wins.
- Signing out removes the portfolio from that browser. It stays in your account. Sessions last a year and renew while you use the app.
- Sign-in links work once and expire after 15 minutes.

### Notes and limitations

- Cost basis uses the **average-cost** method. Realized P/L, dividends and cost basis are converted to the base currency at **current** FX rates. Only the performance chart uses historical FX.
- Cash is tracked as current balances, not as a history of deposits and withdrawals, so the performance chart and returns cover shares only.
- Enter amounts in the share's trading currency, e.g. USD for `AAPL` and GBP (not pence) for `VOD.L`.
- Yahoo Finance is an unofficial data source. Data may be delayed, and delisted symbols lose their history.

## Cockpit

A tile dashboard that goes from market overview to news to opportunities to buy ideas. Its data comes from free, keyless sources, cached on the server:

| Tile | Endpoint | Source |
| --- | --- | --- |
| Mein Depot | `/api/cockpit/depot` | Your depots from the tracker (same calculation as `/depot`), Yahoo prices |
| Märkte, Makro-Markt, Beobachtungsliste | `/api/cockpit/quotes` | Yahoo Finance chart API |
| Tagesgewinner / -verlierer | `/api/cockpit/movers` | Yahoo stock screener, per market |
| Value-Chancen | `/api/cockpit/value` | Yahoo stock screener (KGV, Gewinnwachstum, Verschuldung) |
| Schnäppchen-Radar | `/api/cockpit/radar` | Yahoo stock screener + charts, per market |
| News zu meinen Aktien, Übernahmen & Gerüchte | `/api/cockpit/news` | Google News RSS, keyword-tagged |
| Nächste Quartalszahlen | `/api/cockpit/earnings` | Nasdaq earnings calendar |
| Marktstimmung | `/api/cockpit/sentiment` | CNN Fear & Greed (incl. put/call, VIX) |
| Buffett-Radar | `/api/cockpit/investors` | SEC EDGAR 13F filings |

"Mein Depot" shows the signed-in user's depots from the tracker, all added up or one at a time, using the tracker's own holdings calculation. Year to date compares today's holdings with those on 1 January, net of this year's buys and sells. The watchlist is stored in the browser's `localStorage` (export/import as JSON in the editor). None of these sources has an official API contract, so a tile can break if a provider changes its format.

Gainers/losers, the Schnäppchen-Radar and Value-Chancen each come per market: USA, Schweiz, Deutschland, Europa, UK and Japan, chosen with chips on the tile and remembered per device. The lists come from Yahoo's stock screener, called with the crumb and cookies that `yahoo-finance2` already holds for the depot's quotes (`src/lib/cockpit/screener.ts`); the markets, their liquidity floors and the screens are defined in `src/lib/cockpit/screens.ts`. Secondary listings are kept out by a volume floor and the market's currency. Routes that fan out to many upstream requests set `maxDuration`, so Vercel gives them a minute.

## Finanzen

A financial overview per account: **Einnahmen** (net income), **Fixkosten** (costs that are certain each month or year) and **Investieren** (what goes into the 3rd pillar, shares and so on). Each entry is paid per month, per year, or per month 13× (a salary with a 13th month's pay). The top cards and the split bar show income, fixed costs, investments and what is left, per month or per year, with the fixed-cost share and the savings rate. Monthly figures leave out the 13th month's pay; yearly ones include it and spread yearly costs over twelve months. Changes save to the `budgets` table as you type.

The `budgets` table is created on first use. To bring in an existing overview, add it to `src/lib/budget-seeds.ts` under the account's email: the account starts with it the first time it opens Finanzen, and from then on only what's saved counts.

## Deploying

The Vercel project for `fnnzhrn.ch` builds this repo as a Next.js app (`vercel.json` sets the framework).

### Moving over from the separate Depot project

1. In the **fnnzhrn** Vercel project, add the environment variables from the old **portfolio-tracker** project: `DATABASE_URL` (or connect the same Neon database under **Storage**), `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, and set `BETTER_AUTH_URL=https://fnnzhrn.ch`. Use the same database, so accounts and depots carry over.
2. Deploy this repo. Check that `/login` sends an email and `/depot` shows your depots.
3. Move the domain: remove `depot.fnnzhrn.ch` from the old project and add it to the fnnzhrn project (**Settings → Domains**). The app redirects it to `https://fnnzhrn.ch/depot`. The DNS record stays as it is.
4. Delete the old Vercel project and the `portfolio-tracker` GitHub repository. Everything, including its history, is in this repository.

What users notice: they sign in once more on `fnnzhrn.ch`, since browsers keep cookies and local data per domain. Their depots come back from the database. Edits made on `depot.fnnzhrn.ch` that never reached the server (made offline) stay behind in that browser, so open the old site once while it's still up and let it sync before moving the domain.

# fnnzhrn

Landing page for **https://fnnzhrn.ch**, the home of a group of friends interested in finance.

The landing page is a single static `index.html` with no build step. To add a project, copy one `<li>` block in the "Projekte" list. Page copy is in (Swiss) German.

## Projects

- [Depot](https://depot.fnnzhrn.ch): our shared portfolio tracker ([source](https://github.com/mxmlnwbr/portfolio-tracker))
- [Cockpit](https://fnnzhrn.ch/cockpit/): market dashboard (see below)

## Cockpit

`cockpit/index.html` is a tile dashboard that goes from market overview to news to opportunities to buy ideas. It is backed by small Vercel functions in `api/` that fetch free, keyless data and cache it on Vercel's CDN:

| Tile | Endpoint | Source |
| --- | --- | --- |
| Mein Depot, Märkte, Makro-Markt, Beobachtungsliste, SMI movers | `/api/quotes` | Yahoo Finance chart API |
| Tagesgewinner / -verlierer (USA), Value-Chancen | `/api/screener` | Yahoo predefined screeners |
| Schnäppchen-Radar | `/api/radar` | Yahoo screeners + charts (US stocks) |
| News zu meinen Aktien, Übernahmen & Gerüchte | `/api/news` | Google News RSS, keyword-tagged |
| Nächste Quartalszahlen | `/api/earnings` | Nasdaq earnings calendar |
| Marktstimmung | `/api/sentiment` | CNN Fear & Greed (incl. put/call, VIX) |
| Buffett-Radar | `/api/investors` | SEC EDGAR 13F filings |
| Symbol search in the editor | `/api/search` | Yahoo Finance search |

Depot and watchlist are stored in the browser's `localStorage` (export/import as JSON in the editor). None of these sources has an official API contract, so a tile can break if a provider changes its format.

Local preview (Node 18+, no dependencies):

```sh
node scripts/dev.js   # http://localhost:3000/cockpit/
```

## Deployment

Hosted on Vercel as a static site; Vercel deploys the `api/` functions automatically:

1. In Vercel, **Add New → Project** and import this repo. No framework preset or build command is needed.
2. Under **Settings → Domains**, add `fnnzhrn.ch` (and optionally `www.fnnzhrn.ch`).
3. At the registrar, add the DNS records Vercel shows for the root domain. Keep the existing `depot` record untouched.

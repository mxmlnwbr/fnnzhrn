# fnnzhrn

Landing page for **https://fnnzhrn.ch**, the home of a group of friends interested in finance.

It's a single static `index.html` with no build step. To add a project, copy one `<li>` block in the "Projekte" list. Page copy is in (Swiss) German.

## Projects

- [Depot](https://depot.fnnzhrn.ch): our shared portfolio tracker ([source](https://github.com/mxmlnwbr/portfolio-tracker))
- [Challenge](https://challenge.fnnzhrn.ch): our winter challenge where everyone logs their daily habits and sees the others' progress ([source](https://github.com/mxmlnwbr/winter-challenge))

## Deployment

Hosted on Vercel as a static site:

1. In Vercel, **Add New → Project** and import this repo. No framework preset or build command is needed.
2. Under **Settings → Domains**, add `fnnzhrn.ch` (and optionally `www.fnnzhrn.ch`).
3. At the registrar, add the DNS records Vercel shows for the root domain. Keep the existing `depot` and `challenge` records untouched.

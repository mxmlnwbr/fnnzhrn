# fnnzhrn

Landing page for **https://fnnzhrn.ch**, the home of a group of friends interested in finance.

It's a single static `index.html` with no build step. To add a project, copy one `<li>` block in the Projects list.

## Projects

- [Depot](https://depot.fnnzhrn.ch): our shared portfolio tracker ([source](https://github.com/mxmlnwbr/portfolio-tracker))

## Deployment

Hosted on Vercel as a static site:

1. In Vercel, **Add New → Project** and import this repo. No framework preset or build command is needed.
2. Under **Settings → Domains**, add `fnnzhrn.ch` (and optionally `www.fnnzhrn.ch`).
3. At the registrar, add the DNS records Vercel shows for the root domain. Keep the existing `depot` record untouched.

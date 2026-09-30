# fnnzhrn

Landing page for **https://fnnzhrn.ch**, the home of a group of friends interested in finance.

It's a single static `index.html` with no build step. To add a project, copy one `<li>` block in the "Projekte" list. Page copy is in (Swiss) German.

## Projects

- [Depot](https://depot.fnnzhrn.ch): our shared portfolio tracker ([source](https://github.com/mxmlnwbr/portfolio-tracker))
- [Winter](https://fnnzhrn.ch/winter/): winter challenge where everyone logs their daily habits and sees the others' progress ([`winter/index.html`](winter/index.html), [`api/winter.js`](api/winter.js))

## Winter challenge

Everyone picks their name and logs each day: steps (goal 10k/day), a swim in the lake (2× per week), no junk food (Mon–Fri), reading minutes (2 h per week) and phone/Insta screen time (max. 2 h/day). The page shows every person's week and a season leaderboard (one point per goal reached per week).

- **Participants** are the `PEOPLE` list in `api/winter.js`.
- **Season dates and goals** are the config block at the top of the script in `winter/index.html`.
- **Storage:** the serverless function `api/winter.js` stores entries in Upstash Redis. In Vercel, open **Storage → Create / Connect → Upstash for Redis** and connect it to this project; that sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` names work too). Redeploy afterwards.
- **PIN (optional):** set the env var `WINTER_PIN` to a shared code so only the group can read and write. The page asks for it once and remembers it.

## Deployment

Hosted on Vercel as a static site:

1. In Vercel, **Add New → Project** and import this repo. No framework preset or build command is needed.
2. Under **Settings → Domains**, add `fnnzhrn.ch` (and optionally `www.fnnzhrn.ch`).
3. At the registrar, add the DNS records Vercel shows for the root domain. Keep the existing `depot` record untouched.

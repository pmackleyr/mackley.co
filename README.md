MACKLEY is a static site with a single `index.html` and `styles.css`.

## Getting Started

Open `index.html` directly in a browser or serve the folder with any static file server.

## Production Deploys

`https://whoismackley.com` is served by GitHub Pages from `origin/main` with the repository `CNAME`.
To publish live site changes, commit and push to `main`, then confirm the Pages deployment and live domain.
Do not use `mackley.vercel.app` or Vercel as the production target for this site.

`mackley.co` is a legacy domain. Configure it at the DNS/registrar layer as a permanent forward to
`https://whoismackley.com` so the primary GitHub Pages custom domain remains `whoismackley.com`.

## Payments Worker (Cloudflare)

Deploy the Stripe PaymentIntent worker:

```sh
npm i -g wrangler
wrangler login
cd worker
npm i
wrangler secret put STRIPE_SECRET_KEY
wrangler deploy
```

After deploy, confirm `https://api.mackley.co/create-payment-intent` responds.

## Event Counts

Query first-party hourly counters from the live social proof store:

```sh
node scripts/social-proof-count.mjs get-started 72
```

Common metrics:

- `get-started`
- `checkout-start`
- `checkout-redirect`
- `checkout-session-created`
- `checkout-session-failed`
- `checkout-link-fallback`

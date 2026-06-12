MACKLEY is a static site with a single `index.html` and `styles.css`.

## Getting Started

Open `index.html` directly in a browser or serve the folder with any static file server.

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

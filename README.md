MACKLEY is a static GitHub Pages site. There is no app framework and no build step.

## Project Map

- `index.html` is the home page.
- `styles.css` is the shared design system and site stylesheet. Keep global font, button, spacing, and page-level styles here.
- `product/`, `spray-intake/`, `checkout/`, `thank-you/`, `legal/`, `cookie/`, `purpose/`, and `deeper/` are static page folders.
- `dashboard/` is the private analytics dashboard and has its own `dashboard.css` and `dashboard.js`.
- `public/` contains product images, logos, and visual assets.
- `worker/` contains the Cloudflare Worker used for payments and analytics support.
- `supabase/` contains Supabase function/config files.
- `scripts/` contains local utility scripts.
- `CNAME`, `_redirects`, `robots.txt`, and `domain-redirect.js` control production domain and routing behavior.

## Editing Rules

- Keep HTML minimal and page-specific.
- Keep styling centralized in `styles.css`; only use page-local CSS when the page owns a separate surface, like `dashboard/`.
- Reuse existing classes such as `cta`, `home-product__button`, and `intake-button` instead of inventing new button styles.
- Production is `https://mackley.co`; do not deploy this site to Vercel.

## Getting Started

Open `index.html` directly in a browser or serve the folder with any static file server.

## Production Deploys

`https://mackley.co` is served by GitHub Pages from `origin/main` with the repository `CNAME`.
To publish live site changes, commit and push to `main`, then confirm the Pages deployment and live domain.
Do not use `mackley.vercel.app` or Vercel as the production target for this site.

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

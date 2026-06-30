MACKLEY is a static GitHub Pages site. There is no app framework and no build step.

## Project Map

- `index.html` is the home page.
- `styles.css` is the shared design system and site stylesheet. Keep global font, button, spacing, and page-level styles here.
- `product/`, `spray-intake/`, `checkout/`, `thank-you/`, `legal/`, `cookie/`, `purpose/`, and `deeper/` are static page folders.
- `dashboard/` is the private operations dashboard. Localhost uses synthetic preview data; production requires Cloudflare Access.
- `public/` contains product images, logos, and visual assets.
- `worker/` contains the Cloudflare Worker used for intake, payments, provider review, referrals, analytics, and operator APIs.
- `docs/` contains architecture, security, metrics, data-model, and runbook documentation.
- `supabase/` contains Supabase function/config files.
- `scripts/` contains local utility scripts.
- `CNAME`, `_redirects`, `robots.txt`, and `domain-redirect.js` control production domain and routing behavior.

## Editing Rules

- Keep HTML minimal and page-specific.
- Keep styling centralized in `styles.css`; only use page-local CSS when the page owns a separate surface, like `dashboard/`.
- Reuse existing classes such as `cta`, `home-product__button`, and `intake-button` instead of inventing new button styles.
- Production is `https://mackley.co`; do not deploy this site to Vercel.

## Getting Started

Open `index.html` directly in a browser or run:

```sh
npm run dev
```

Then open `http://127.0.0.1:8000/`. The operations preview is at `http://127.0.0.1:8000/dashboard/`.

Run the contract and security checks with:

```sh
npm test
npm run test:security
```

## Production Deploys

`https://mackley.co` is served by GitHub Pages from `origin/main` with the repository `CNAME`.
To publish live site changes, commit and push to `main`, then confirm the Pages deployment and live domain.
Do not use `mackley.vercel.app` or Vercel as the production target for this site.

`whoismackley.com` is a legacy domain. Configure it at the DNS/registrar layer as a permanent forward to
`https://mackley.co` so the primary GitHub Pages custom domain remains `mackley.co`.

## Payments Worker (Cloudflare)

Deploy the Stripe Checkout/manual-capture worker:

```sh
npm i -g wrangler
wrangler login
cd worker
npm i
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put CF_ACCESS_AUD
wrangler deploy
```

Configure Stripe to send `checkout.session.completed` to `https://api.mackley.co/stripe/webhook`.
After deploy, confirm `https://api.mackley.co/create-payment-intent` returns `410` and provider-review checkout uses `/create-checkout-session` only.

Operator routes use Cloudflare Access JWTs and role allowlists. See `docs/security.md` and `worker/README.md` before deploying Worker changes.

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

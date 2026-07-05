# MACKLEY API Worker

## Responsibilities

- Accept provider requests and email verification.
- Create Stripe Checkout Sessions using manual capture.
- Persist the provider-review order lifecycle.
- Capture or cancel authorizations after provider decisions.
- Create subscriptions only after approval.
- Track referrals, social proof, and first-party analytics.
- Serve role-scoped operator read models.

## Operator Authentication

Protect these paths with Cloudflare Access and require a valid Access JWT in the Worker:

- `/ops/*`
- `/api/provider/*`
- `/analytics/dashboard`
- `/access-entries`
- `/referrals/redeem`

Configure:

```text
CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com
CF_ACCESS_AUD=<application audience tag>
OPS_OWNER_EMAILS=owner@example.com
OPS_PROVIDER_EMAILS=provider@example.com
OPS_ANALYST_EMAILS=analyst@example.com
OPS_SUPPORT_EMAILS=support@example.com
ALLOW_LEGACY_ADMIN_SECRET=false
```

Email lists are comma-separated. Unlisted identities are denied even when Cloudflare Access authenticates them.

`ALLOW_LEGACY_ADMIN_SECRET=true` currently keeps the dashboard functional until Cloudflare Access is configured. The dashboard holds that password in memory only. Set the flag to `false` and remove the old secret immediately after Access is verified.

## Required Secrets

```sh
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put NETI_SHIPPING_RATE_ID
wrangler secret put RESEND_API_KEY
wrangler secret put CF_ACCESS_AUD
```

The Access audience is not confidential, but storing it as deployment configuration avoids committing environment-specific identifiers.

## Deploy

```sh
cd worker
npm install
npm run deploy
```

Configure Stripe to send `checkout.session.completed` to `https://api.mackley.co/stripe/webhook`.

## Payment Invariants

1. Checkout uses `capture_method=manual`.
2. `checkout.session.completed` creates `PENDING_PROVIDER_REVIEW`.
3. Approval captures once, then creates one subscription using idempotency keys.
4. Denial cancels the authorization and never creates a subscription.
5. `ACTIVE` and `DENIED` are terminal states.
6. Every status transition appends an application audit event.

`/create-payment-intent` remains retired with HTTP `410`.

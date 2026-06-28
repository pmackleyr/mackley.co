# MACKLEY Payments Worker

## Overview
Cloudflare Worker for provider requests, Stripe Checkout manual authorization, and licensed-provider approval or denial.

## Deploy
1) Install Wrangler
```sh
npm i -g wrangler
```

2) Authenticate
```sh
wrangler login
```

3) Install dependencies
```sh
cd worker
npm i
```

4) Set the required secrets
```sh
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put PROVIDER_ADMIN_SECRET
wrangler secret put RESEND_API_KEY
```

Optional access request email overrides:
```sh
wrangler secret put ACCESS_EMAIL_FROM
wrangler secret put ACCESS_REQUEST_NOTIFY_TO
wrangler secret put PAYMENTS_EMAIL_FROM
```

5) Deploy
```sh
wrangler deploy
```

Configure Stripe to send `checkout.session.completed` to `https://api.mackley.co/stripe/webhook`.

The customer flow uses `/provider-requests`, then `/create-checkout-session`. Checkout authorizes $99 without capture. Provider actions require `Authorization: Bearer <PROVIDER_ADMIN_SECRET>`:

```sh
curl -X POST https://api.mackley.co/api/provider/approve/ORDER_ID -H "Authorization: Bearer $PROVIDER_ADMIN_SECRET"
curl -X POST https://api.mackley.co/api/provider/deny/ORDER_ID -H "Authorization: Bearer $PROVIDER_ADMIN_SECRET"
```

Approval captures the authorization and creates the monthly subscription. Denial cancels the authorization. `/create-payment-intent` is intentionally retired with HTTP `410`.

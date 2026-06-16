# MACKLEY Payments Worker

## Overview
Cloudflare Worker for creating Stripe PaymentIntents for the MACKLEY checkout flow.

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
wrangler secret put RESEND_API_KEY
```

Optional access request email overrides:
```sh
wrangler secret put ACCESS_EMAIL_FROM
wrangler secret put ACCESS_REQUEST_NOTIFY_TO
```

5) Deploy
```sh
wrangler deploy
```

After deploy, verify the endpoint at `https://api.mackley.co/create-payment-intent`.

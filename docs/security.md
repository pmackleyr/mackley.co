# Security Controls

## Implemented

- Cloudflare Access JWT verification at the Worker, including issuer, audience, expiry, key ID, and RS256 signature checks.
- Explicit operator roles: owner, provider, analyst, and support.
- Deny-by-default operator access; the temporary shared-secret fallback requires an explicit migration flag and is never persisted by the dashboard.
- No fallback dashboard password.
- No dashboard password stored in browser storage.
- Intake health answers remain server-side; only a minimal receipt uses `sessionStorage`.
- Stripe webhook verification uses the raw body and a five-minute tolerance.
- Capture, cancellation, and subscription creation use stable idempotency keys.
- Order lifecycle transitions are allowlisted and audited.
- Operator API responses use `no-store` and masked customer email addresses.
- Worker preview domain is disabled to reduce alternate-origin exposure.

## Deployment Requirements

1. Create a Cloudflare Access application for the operator paths listed in `worker/README.md`.
2. Set the Access audience and role allowlists.
3. After Cloudflare Access is verified, set `ALLOW_LEGACY_ADMIN_SECRET=false` and remove `DASHBOARD_SHARED_SECRET`.
4. Restrict Cloudflare deployment access and Stripe/Resend secrets to production operators.
5. Configure rate limits for public mutation endpoints at the Cloudflare edge.
6. Alert on Stripe webhook failures, provider actions, authorization expiry, and repeated 4xx/5xx responses.
7. Confirm every vendor handling protected health information has the required contractual and operational controls. This codebase alone does not establish regulatory compliance.

## Remaining Hardening

- Move the public site from GitHub Pages to Cloudflare Workers Static Assets when strict response headers and a Content Security Policy can be rolled out with report-only validation first.
- Add a queue and dead-letter queue for webhook side effects and email delivery.
- Replace the Durable Object request store with an encrypted, queryable clinical datastore if volume or provider workflow requires it.
- Remove legacy Vercel/Supabase handlers after a measured no-traffic window.
- Add automated dependency, secret, and dynamic application scanning in CI.

## Incident Priorities

1. Protect customer health and payment state.
2. Stop unauthorized operator access.
3. Prevent duplicate captures or subscriptions.
4. Preserve the audit trail.
5. Restore customer communication and analytics after transactional integrity is confirmed.

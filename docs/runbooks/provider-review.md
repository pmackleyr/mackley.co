# Provider Review Runbook

## Start of Shift

1. Open `/dashboard/` through Cloudflare Access.
2. Check Reliability before reviewing orders.
3. Work the review queue in authorization-expiry order.
4. Escalate any authorization under 24 hours or approval job processing longer than 15 minutes.

## Approve

1. Confirm the licensed provider has reviewed the complete request.
2. Confirm the order remains `PENDING_PROVIDER_REVIEW`.
3. Approve once. The backend moves to `APPROVAL_PROCESSING`, captures the existing authorization, creates one subscription, and moves to `ACTIVE`.
4. Confirm the audit trail shows provider approval, capture, and activation.
5. Confirm the approval email was sent.

Do not retry blindly if the UI times out. Refresh the order first; idempotency protects Stripe calls, but the displayed state determines the next safe action.

## Deny

1. Confirm the order has not reached `PAYMENT_CAPTURED` or `ACTIVE`.
2. Deny once. The backend cancels the authorization and moves to `DENIED`.
3. Confirm the audit trail and denial email.

## Stalled Processing

1. Read the current Stripe PaymentIntent and subscription state before changing anything.
2. If capture succeeded but the order is not active, do not cancel the PaymentIntent.
3. Reconcile the order with Stripe using the existing order ID and idempotency keys.
4. Record the incident and corrective action outside the customer medical record.

## Authorization Expiry

1. Contact the provider queue owner immediately when less than 24 hours remain.
2. If review cannot complete before expiry, do not represent the hold as chargeable.
3. Ask the customer to reauthorize through a new Checkout Session after the provider workflow is ready.

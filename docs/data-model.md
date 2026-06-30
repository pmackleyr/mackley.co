# Data Model

## Provider Request

The provider request contains identity, state, safety answers, medications, goals, baseline scores, clinician note, and attestation. It is server-side sensitive data. Do not place it in browser persistence, analytics payloads, logs, URLs, or referral records.

## Browser Receipt

The browser may hold only these short-lived fields in `sessionStorage`:

- `requestId`
- `email`
- `fullName`
- referral claim/code
- `checkoutSessionId`
- payment status
- `orderId`
- verification-email delivery state

The receipt exists only to resume checkout and referral sharing. A one-time migration sanitizes and deletes legacy questionnaire payloads from `localStorage`.

## Order

```text
AWAITING_AUTHORIZATION
  -> PENDING_PROVIDER_REVIEW
  -> APPROVAL_PROCESSING
  -> PAYMENT_CAPTURED
  -> ACTIVE

PENDING_PROVIDER_REVIEW -> DENIED
APPROVAL_PROCESSING -> DENIED
```

`ACTIVE` and `DENIED` are terminal. The state machine rejects every transition not explicitly listed.

## Audit Event

Each status change records:

- event ID and timestamp
- action and reason
- previous and next status
- actor ID, email, and role
- order ID (storage partition)

Audit records are append-only at the application boundary and capped per order to prevent unbounded Durable Object growth.

## Operator Read Model

`/ops/dashboard` returns aggregated KPIs, masked identity, review urgency, referral performance, reliability checks, and recent audit events. It intentionally excludes health-answer detail. Provider detail should remain a separate, role-scoped workflow.

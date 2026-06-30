# Metric Dictionary

## Primary Funnel

| Metric | Definition | Owner |
| --- | --- | --- |
| Landing sessions | Unique sessions reaching `/` or `/product/` | Growth |
| CTA seen | Sessions with a primary CTA impression | Growth |
| Intake started | Sessions beginning the provider intake | Growth |
| Survey submitted | Valid provider requests accepted server-side | Clinical operations |
| Payment authorized | Stripe Checkout completed with manual capture pending | Payments |
| Activated | Provider-approved order captured and subscription created | Payments |

## Operating KPIs

| KPI | Calculation | Alert condition |
| --- | --- | --- |
| Survey rate | Submitted surveys / landing sessions | Investigate material week-over-week decline |
| Pending reviews | Orders in awaiting, pending, or processing state | Queue exceeds provider capacity |
| Authorized value | Sum of uncaptured pending authorizations | Monitor with expiry window |
| Activation rate | Active orders / all reviewed orders | Segment by denial reason before acting |
| Referral conversion | Activated referred orders / accepted referral claims | Compare against direct activation |
| Authorization expiry | Hours until Stripe capture deadline | Alert at 24 hours |
| Stalled approval | `APPROVAL_PROCESSING` older than 15 minutes | Immediate investigation |

## Event Rules

- Event IDs must be stable enough for server deduplication.
- Never send medical answers, clinician notes, full email addresses, or payment details to analytics.
- Payment success comes from verified server state, never a browser-only event.
- KPI code and dashboard labels must use the same definitions.

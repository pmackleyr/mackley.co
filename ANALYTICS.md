# Operations Dashboard

The private operator surface lives at `/dashboard/`.

- On localhost, it renders synthetic data from `dashboard/demo-data.js`.
- In production, it requests `POST https://api.mackley.co/ops/dashboard` with Cloudflare Access credentials.
- No shared password is accepted or stored by the dashboard.
- The Worker returns a purpose-built read model with masked customer identity, review urgency, referral performance, and reliability checks.

The browser event collector remains `POST /analytics/collect`. Metric names and ownership are defined in `docs/metrics.md`.

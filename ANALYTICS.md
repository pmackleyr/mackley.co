# Analytics Dashboard

The private session dashboard lives at `/dashboard`.

Access:

- Password: `DATA_DASHBOARD_PASSWORD`
- Default local password: `BreatheDeeper`
- Shared worker secret: `DASHBOARD_SHARED_SECRET` (defaults to the same value)

Data flow:

- Browser events are collected by `https://api.mackley.co/analytics/collect`
- The dashboard reads aggregated data from `https://api.mackley.co/analytics/dashboard`
- The dashboard UI is protected by a signed cookie and the dashboard API checks that session before returning data

Notes:

- The dashboard is intentionally `noindex`
- `/data` redirects to `/dashboard` for backwards compatibility

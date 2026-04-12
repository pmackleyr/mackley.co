Original prompt: simplify the dashboard into one plain table and keep the password gate simple; password is BreatheDeeper.

Definition of Done: after login, the dashboard shows a single readable table of sessions with page flow, clicks, time spent per page, source/referrer, device, and location; the auth gate remains dark and centered; the page passes local syntax checks and the updated branch is pushed to main.

2026-04-12: Starting implementation. Next steps are to replace the row-card layout with a single table, trim the gate copy/styles to match the reference screenshot, validate locally, and push main.
2026-04-12: Completed the single-table dashboard pass. Verified the locked gate and unlocked table in Chromium with mocked analytics data, including page flow, click chips, source, device, location, and time columns.

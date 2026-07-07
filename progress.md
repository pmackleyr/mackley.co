Original prompt: update the Neti Pot offer into an email-first free Neti Pot capture on the home page and /breathedeeper, keep the existing carousel images, send a verification/shipping-payment email after submission, preserve the premium site-wide visual language, and publish to GitHub Pages.

Definition of Done: both homepage Neti Pot sections use a three-column email/carousel/copy layout with "Learn more" and "Enter email"; the /breathedeeper product page makes email entry the main CTA; successful submissions call a CORS-locked Worker endpoint that emails the next verification step; local static, syntax, Worker route, and live-domain checks pass before the GitHub Pages release is complete.

2026-07-06: Started from the clean production-aligned worktree at origin/main 8417050. The existing Neti product assets and two-product routes are intact; applying the email capture as the smallest shared component change across the homepage and Neti page.
2026-07-07: Preview pass updated per review: homepage Neti email copy now matches the product title size, the right-side Enter Email CTA is removed, the product page uses only the pinned email form, the "But first" product subtitle is gone, Neti product prose uses uniform paragraph sizing, and the email form remains above the hover blur. Syntax checks, local static checks, and mocked Worker lead-route checks passed.
2026-07-07: Added the dark closing treatment for the homepage Neti section: black section background, white/soft-white text, dark glass header state, transparent dark-footer treatment, and a fade plus down-arrow cue from the INF section into the Neti section. Browser computed-color checks passed on the active Neti section.

---

Original prompt: restore the missing product images, make the operations dashboard show purchases, a click/count/percent conversion funnel, and people with name, contact, location, and status, then publish to GitHub Pages.

Definition of Done: product images visibly render on the home and product pages at desktop and mobile widths; the dashboard reports purchases, each funnel stage's count and conversion percent, and authorized owner/provider views show customer name, contact, location, and status while analyst/support views remain masked; deterministic browser checks, automated tests, and live-domain verification pass before production is considered complete.

2026-06-30: Confirmed both product PNGs are intact, byte-identical across worktrees, and return HTTP 200 with the correct image content type. Starting rendered-page and console/network diagnosis before changing product code.
2026-06-30: Chromium QA confirmed both 1254px product images render at nonzero desktop/mobile dimensions and the homepage image renders when its section is active. Added purchases, captured value, Get Prescription click counts/percentages, and role-scoped name/contact/location/status to the operations dashboard. The first browser run passed both image scenarios; the dashboard scenario reached the correct data but required a more specific People-table selector because the same name also appears in the review queue.
2026-06-30: Final deterministic run passed all three rendered scenarios. Added a product-image cache refresh, preserved the existing assets/layout, added full owner/provider contact visibility with masked analyst/support views, and kept the existing dashboard secret as an in-memory-only migration fallback until Cloudflare Access is configured.

---

Original prompt: make the CTA copper fill cover the full button with readable text while rotating, reduce the home scroll indicator to three states, keep product copy left aligned, add an eight-step provider intake with Stripe manual authorization and provider approve/deny processing, verify responsive behavior, and push live.

Definition of Done: every primary CTA has a full-bleed copper base and a visibly rotating copper highlight with the label above both layers; the home page progress rail contains exactly three states while other scrollable routes retain the detailed rail; product prose stays left aligned at every viewport; the intake restricts sex to Male/Female and ends in a Stripe card authorization that is captured only through authenticated, idempotent provider approval; denial releases the authorization; responsive browser QA and syntax checks pass.

2026-06-27: Started the full CTA, three-state home progress, product alignment, and manual-capture checkout pass. The supplied 736x981 copper texture is now available and will be the canonical CTA texture.
2026-06-27: Added the missing copper asset and split CTA rendering into a full-cover base, oversized rotating highlight, and z-indexed label. Browser checks confirmed the asset resolves, the base covers the full inset, labels remain above both layers, and product prose stays left aligned at 390, 768, 1440, and 2560 pixel widths with no horizontal overflow.
2026-06-27: Reduced the home progress rail to three ticks and tied it to the three sections in the active narrative only. Verified three states at mobile, desktop, and TV-sized viewports.
2026-06-27: Added Step 8 payment authorization, restricted sex to Male/Female, retired legacy immediate PaymentIntents, and implemented provider request storage, Stripe manual-capture Checkout, signed webhook ingestion, authenticated/idempotent approve and deny endpoints, deferred monthly subscription creation, and approval/denial email handling. Worker dry-run and local Durable Object route checks passed.
2026-06-27: Preserved the referral loop on the authorization confirmation page. Verified valid Stripe webhook signatures return 200, invalid signatures return 400, legacy PaymentIntent creation returns 410, and malformed sex values return 400.
2026-06-27: Production publish remains pending because the live Worker does not yet have STRIPE_WEBHOOK_SECRET. No push or deploy was attempted.
2026-06-27: Reworked the copper hover after visual feedback. Removed the independently moving diagonal shine gradient, enlarged the rotating copper surface to 240% of button width, softened it with a uniform blend, and kept the glass highlight stationary. Verified the updated asset, full-cover layer, rotating layer, label stacking, and overflow behavior in the local browser.

---

Original prompt: simplify the dashboard into one plain table and keep the password gate simple; password is BreatheDeeper.

Definition of Done: after login, the dashboard shows a single readable table of sessions with page flow, clicks, time spent per page, source/referrer, device, and location; the auth gate remains dark and centered; the page passes local syntax checks and the updated branch is pushed to main.

2026-04-12: Starting implementation. Next steps are to replace the row-card layout with a single table, trim the gate copy/styles to match the reference screenshot, validate locally, and push main.
2026-04-12: Completed the single-table dashboard pass. Verified the locked gate and unlocked table in Chromium with mocked analytics data, including page flow, click chips, source, device, location, and time columns.

---

Original prompt: publish the current two-product storefront preview, including the /icanchange and /breathedeeper routes, revised Neti Pot image and description, and BREATHEDEEPER checkout copy, to mackley.co.

Definition of Done: the static storefront passes unit, security, and responsive Playwright checks; the full reviewed diff is committed and pushed to origin/main; GitHub Pages serves the new routes and copy; the Cloudflare Worker is not deployed until NETI_SHIPPING_RATE_ID is configured.

2026-07-05: Confirmed origin/main remains at b24a32a, the local preview contains the reviewed two-product build, and the production Worker has Stripe credentials but no NETI_SHIPPING_RATE_ID. Proceeding with the GitHub Pages release while holding the Worker deployment closed.
2026-07-05: Release validation passed: 11 unit/contract tests, the security audit, and 8 Playwright scenarios covering both product routes, mobile CTA visibility, legacy routing, offer-code prefill, product imagery, and dashboard state. No Worker deployment was attempted.

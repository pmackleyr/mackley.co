# Storefront refinement — November 12, 2026

- Navigation: compact 56px glass bar (54px mobile), reduced fill/blur/shadow; preserved Inter and packaging red. Reading type 18–21px; title 32–56px; scene statements 36–80px. Reduced transparency/contrast fallbacks provided.
- Reference: Apple's Human Interface Guidelines, Materials, https://developer.apple.com/design/human-interface-guidelines/materials — use glass sparingly in navigation and prioritize the content beneath it. This CSS treatment approximates the visual direction; it is not Apple's native Liquid Glass renderer.
- Essay reference: https://parkermackley.com/styles.css and /neti-pot.html, read November 12. Borrowed image-first composition, a restrained reading column, and a colored initial. Product prose has no interim subtitles.
- Shared three-image product carousel supports native swipe, arrows, dots, Home/End keys, focus states, resize and reduced motion.
- The original six GIFs were converted to H264 MP4s with the same imagery. Native completion events, progress watchdog, finite failures, preloading, visibility recovery and static-poster fallback replace inferred GIF timers. No customer-facing motion button.
- Copper FAQ distinguishes Ayurvedic heritage from evidence about the product. Historical source: https://insa.nic.in/writereaddata/UpLoadedFiles/IJHS/Vol48_3_2_CYJagtap.pdf. Primary copper-vessel study: https://pubmed.ncbi.nlm.nih.gov/22524115/. Findings about drinking water stored in copper for 16 hours do not demonstrate healing benefits or sterilization of fresh nasal saline.
- Contents remain one 400mL copper pot and one microfiber towel. No scoop; salt is not included.
- Checks: 12 playback lifecycle/media tests, 3 carousel tests, syntax, internal assets/links/IDs, metadata, copy and matching-component contracts. The six MP4s fully decode and have fast-start metadata.
- Browser visual/device verification was unavailable in this session. Purchase-email delivery remains unverified. GitHub production publishing still requires valid repository write authentication.


## iPhone SE and packaging finish

- One-line container-relative headings verified against exact Inter600 glyph metrics at320px and375px. Product name9.4265em, long headline18.8549em at conservative optical-size14; widths at320px are251.3px and256.4px within272px. The long heading scales to13.6px to meet the owner's one-line requirement; reading copy remains18px.
- Six-slide carousel includes exact supplied1/2/3 artwork and color-profile-preserving WebP versions. Both pages share markup, with a lower home-photo loading priority below the opening scenes. Shared24px corners for buttons, carousel and demonstration video.
- The original720x1060,22.4-second demonstration now replaces the lower generic offer, followed by the requested title and short description. Stripe reassurance removed; local Natural Grocers inquiry retained.
- Visible MACKLEY mentions share Inter/red styling; metadata remains plain text.
- Older Safari gets100vh fallback, text-size-adjust100%, and portable auto scrolling for resize/reduced-motion positioning. Pinch zoom is not disabled.
- Static sizing, assets, IDs, captions, schema, branding and destinations validated. Actual Safari/device rendering and payment-email delivery remain unverified.


2026-11-12 final checkout cleanup: replaced packaging illustration 2 with the owner's 2048 × 1555 updated original and a color-profile-preserving WebP derivative. Both galleries reference the versioned replacement. Removed the duplicate lower title, tagline, and price; moved the single essay checkout action directly after the narrative and before the demonstration. Kept the requested Natural Grocers inquiry below the film. Images now retain their intrinsic proportions inside a stable 4:3 track, with the shared 24px radius on each image itself. GitHub CLI authentication succeeded for pmackleyr; the local repository helper reuses the private workspace credential. GitHub Pages remains the production deployment path. Browser and physical-device validation remain unavailable.

(function (win) {
  const netiPot = {
    key: "netiPot",
    slug: "neti",
    type: "retail",
    name: "Pure Copper Neti Pot",
    code: "Original",
    codeHtml: "Original",
    fullNameHtml: "Pure Copper Neti Pot",
    audience: "Best possible tool for the most important hygienic habit.",
    formula: "",
    purpose: "A simple daily practice. Breathe deeper.",
    ctaLabel: "Buy now",
    value: "42",
    currency: "USD",
    stripeProductId: "prod_TjrlBklHSKvSEf",
    intakeLink: "https://buy.stripe.com/7sY00j0Mx6EGdd256idwc05",
    commerceAction: "neti-checkout",
    images: [
      {
        src: "/public/product/neti-cutout.webp",
        alt: "Pure copper MACKLEY neti pot with an angled spout"
      }
    ],
    story: [{ html: `<p>You enter this world on a breath. You leave when breathing stops. The shape of your life is determined by the shape of every breath you take in between.</p><section class="mk-editorial-block">
        <p>Breathing is the most important habit. But almost nobody, except for true yogis, takes radical care of their nasal passages.</p>
        <p>The majority of us brush our teeth every morning, many filter the water we drink, but very few clean the passage that every breath travels through.</p>
      </section>
      <figure class="mk-editorial-pot"><img src="/public/product/neti-cutout.webp" width="1500" height="1125" alt="Hand-shaped pure copper MACKLEY neti pot" fetchpriority="high" decoding="async" /><figcaption>Pure copper. Hand-shaped. 400 mL.</figcaption></figure>
      <section class="mk-editorial-block">
        <h2>Water. Salt. Gravity. That’s it.</h2>
        <p>Fill this pure copper neti pot each morning with distilled, sterile, or boiled-and-cooled water and a measured saline mix, then rinse each nostril.</p>
        <p>The salt is intended to match the salinity of your body’s fluids, making the rinse more comfortable. Follow the saline mix’s water measurements.</p>
        <p>You may feel your sinuses clear and your nasal passages open. Even if you don’t <em>think</em> you have junk up there, we all live in a polluted world. A saline rinse can help wash away dust, pollen, and mucus.</p>
      </section>
      <section class="mk-editorial-block">
        <h2>This is a ritual.</h2>
        <p>When air enters and fills you, that’s new fuel for life. The more freely you can breathe, the more alive you feel.</p>
      </section>
      <figure class="mk-editorial-real"><img src="/public/product/neti-front.jpg" width="1080" height="1440" alt="MACKLEY’s pure copper neti pot held in warm morning sunlight" loading="lazy" decoding="async" /></figure>
      <section class="mk-editorial-block">
        <h2>This is where MACKLEY begins.</h2>
        <p>I prefer pure copper to plastic when performing <em>jala neti</em>—the yogic practice of nasal rinsing.</p>
        <p>This is the best pure copper neti pot I could find. It’s sourced by my friend, who I met at the Bihar School of Yoga, an ashram in Bihar, India. Every morning, the first thing the older yogis did was rinse their noses because it helped them breathe in the day.</p>
        <p>But cleaning your nose isn’t a common habit in the United States. So my friend helped me find the very best copper neti pot he could, and we landed on the one his grandpa has used for 40 years straight.</p>
      </section>
      <figure class="mk-editorial-real"><img src="/public/product/neti-top.jpg" width="1080" height="1440" alt="Looking into the pure copper neti pot, with the MACKLEY M at its base" loading="lazy" decoding="async" /></figure>
      <section class="mk-editorial-block">
        <h2>Made for each morning.</h2>
        <p>It’s hand-shaped, pure copper, and includes a microfiber towel.</p>
        <p>Wash it with mild soap and safe water after each use, let the inside dry completely, and dry the outside with the towel to help slow oxidation. Copper may darken over time.</p>
        <p>Warning: once you start, you may never want to stop.</p>
        <p class="mk-signature">Parker Mackley Revers</p>
      </section>` }]
  };

  win.MACKLEYCatalog = { netiPot };
  win.MACKLEYProduct = netiPot;
  win.document.documentElement.dataset.productConfig = netiPot.name;
})(window);

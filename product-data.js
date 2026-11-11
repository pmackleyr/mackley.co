(function (win) {
  const netiPot = {
    key: "netiPot",
    slug: "breathedeeper",
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
        src: "/public/product/neti-pot-01.png?v=20260702-neti-offer-v2",
        alt: "Original Copper Neti Pot with MACKLEY wordmark"
      }
    ],
    story: [
      {
        html: `<p>You enter this world on a breath. You leave when breathing stops. Everything in between is shaped by the breaths you take.</p>

        <p>You can survive for months without food and days without water, but only minutes without air. Breathing is the one thing you have been doing every moment of your life, yet most people rarely think about it until something gets in the way.</p>

        <p>The majority of us brush our teeth every morning, many filter the water we drink, but very few clean the passage that every breath travels through. Crazy!&mdash;when you consider how much attention we give to every other part of daily hygiene.</p>

        <p>Your nose is your body's primary airway. Before air reaches your lungs, it is filtered, warmed, and humidified inside your nasal passage. Throughout the day, dust, pollen, and other airborne particles become trapped in mucus instead of traveling deeper into your respiratory system. Like every filter, it works best when it is cleaned regularly.</p>

        <p>A neti pot is a simple way to do just that. Warm saline flows gently through one nostril and out the other, carrying away mucus and accumulated debris as it passes. The practice takes only a few minutes and requires nothing more than water, salt, and gravity.</p>

        <p>This practice has been part of daily life for thousands of years. In the yogic tradition it is known as "jala neti" and is commonly performed before breathwork, meditation, or physical exercise. The idea is that if you can clear your airways first, then everything that follows begins with a better breath.</p>

        <p>This Pure Copper Neti Pot is made of pure copper, the material traditionally used for jala neti. It is hand-shaped, built to last, and designed for daily routine.</p>

        <p>We believe nasal hygiene belongs alongside brushing your teeth and washing your hands. It is one of the simplest habits you can build, and one of the easiest to overlook.</p>

        <p><strong>Includes:</strong><br />Pure Copper Neti Pot<br />Copper salt scoop<br />Premium microfiber towel</p>

        `
      }
    ]
  };

  win.MACKLEYCatalog = { netiPot };
  win.MACKLEYProduct = netiPot;
  win.document.documentElement.dataset.productConfig = netiPot.name;
})(window);

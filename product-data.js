(function (win) {
  const inf = {
    key: "inf",
    slug: "icanchange",
    type: "prescription",
    name: "Intranasal Neuropeptide Formula",
    code: "INF\u2122",
    codeHtml: "INF&trade;",
    fullNameHtml: "<span class=\"home-product__code\">INF&trade;</span> Intranasal Neuropeptide Formula",
    audience: "For adults (18+)",
    formula: "with Semax + Selank + Oxytocin",
    purpose: "for plasticity, clarity and connection",
    ctaLabel: "Get Prescription",
    value: "99",
    currency: "USD",
    stripeProductId: "prod_UgF2SFTaA6cCVy",
    intakeLink: "/intake/?next=payment",
    commerceAction: "request-prescription",
    includedItems: [
      {
        key: "netiPot",
        sku: "NETI-ORIGINAL",
        quantity: 1,
        fulfillment: "first-approved-shipment",
        requiredCode: "BREATHEDEEPER",
        shippingHandlingPaidByCustomer: true
      }
    ],
    images: [
      {
        src: "/public/product/inf-product-tight-01.png?v=20260630-product-images-v1",
        alt: "INF intranasal formula bottle with copper applicator and MACKLEY cap"
      },
      {
        src: "/public/product/inf-product-tight-02.png?v=20260630-product-images-v1",
        alt: "INF intranasal formula kit packed in a black travel bag with copper neti pot"
      }
    ],
    story: [
      {
        html: `<p>If you can change how you think, then you can change who you are.<br />Science calls this <em>neuroplasticity</em>: your brain's ability to change through experience.<br />Everyone has this superpower, few understand it, even fewer use it to their advantage.</p>

        <p><strong>INF&trade; Intranasal Neuropeptide Formula</strong> exists to increase your brain's neuroplasticity, filter signal from noise, and inspire connection so change accelerates from inside to out.<br />These select neuropeptides do NOT "create" new thoughts.<br />But they can shift you into new state where learning, clarity and confidence come more easily.<br />Everything begins with state:</p>

        <p><strong>State &rarr; Thoughts &rarr; Actions &rarr; Change</strong></p>

        <p>Your <u>state</u> determines what you notice.<br />What you notice influences your <u>thoughts</u>.<br />What you repeatedly think drives your <u>actions</u>.<br />And it's what you repeatedly do that leads to <u>change</u>.</p>

        <p>Each ingredient supports a critical aspect of your learning and growth process.</p>

        <p><strong>Semax</strong> helps you learn.<br />Originally discovered in the 1980s at the Institute of Molecular Genetics of the Russian Academy of Sciences ("MGRAS"), researchers were looking for compounds to (i) protect the brain during stroke and low-oxygen, (ii) improve recovery after neurological injury, and (iii) enhance learning and adaptation under extreme conditions.<br />Over the next several decades Semax was studied for: (iv) acute ischemic stroke, (v) cognitive impairment, (vi) optic nerve disorders, (vii) recovery after brain injury, and (viii) memory and attention.<br />In 2011 Semax was added to the Russian government's list of essential medicines and remains a prescription drug there.</p>

        <p>You can think of Semax helping your brain say:</p>
        <blockquote><p>"This experience matters, remember it for later."</p></blockquote>
        <p>So rather than deciding what you learn, it helps your brain retain what matters.</p>

        <p><strong>Selank</strong> was developed to reduce anxiety without the downsides of benzodiazepines.<br />This anti-anxiety peptide was also developed and studied in Russia starting in the 1980s.<br />It seems to preserve attention, learning, and memory without causing sedation, although this remains an active area of research.<br />If you imagine your brain as a radio, Selank reduces static and separates signal-from-noise.</p>

        <p>Now think back to when you learned and grew the most personally.<br />It probably didn't happen in isolation, but rather in <u>relationship</u> with others.<br />Humans are a social species so we adapt and evolve with our friends.</p>

        <p><strong>Oxytocin</strong> makes INF&trade; truly unique because it supports connection.<br />This neuropeptide is involved in how your brain processes social and emotional information.<br />It does not install new thoughts nor emotions, but it may help your brain become more receptive to meaningful experiences, relationships, and feedback.<br />These moments that often drive lasting learning and personal growth.</p>

        <p>Each INF&trade; peptide helps unlock your potential.<br /><em>Semax</em> helps you learn.<br /><em>Selank</em> drives clarity.<br /><em>Oxytocin</em> encourages connection.</p>

        <p>If you believe this formula is right for you, the next step is to click "Get Prescription" at the bottom of this page.</p>

        <p>You will then:</p>
        <ol>
          <li>Complete a short health survey.</li>
          <li>A licensed medical provider will review your responses.</li>
          <li>If approved, we will process and ship your prescription.</li>
        </ol>

        <p>If you have additional questions, find detailed answers in the FAQ at the bottom of this page.</p>`
      }
    ]
  };

  const netiPot = {
    key: "netiPot",
    slug: "breathedeeper",
    type: "retail",
    name: "Original Copper Neti Pot\u2122",
    code: "Original",
    codeHtml: "Original",
    fullNameHtml: "<span class=\"home-product__code\">Original Copper</span> Neti Pot&trade;",
    audience: "Breathe deeper.",
    formula: "solid copper",
    purpose: "Use code BREATHEDEEPER during checkout for free neti pot.",
    ctaLabel: "Get it free with INF",
    value: "0",
    currency: "USD",
    stripeProductId: "",
    intakeLink: "/intake/?next=payment&offer=BREATHEDEEPER",
    commerceAction: "request-prescription",
    images: [
      {
        src: "/public/product/neti-pot-01.png?v=20260702-neti-offer-v2",
        alt: "Original Copper Neti Pot with MACKLEY wordmark"
      },
      {
        src: "/public/product/neti-pot-02.png?v=20260701-neti-preview-v1",
        alt: "Original Copper Neti Pot and INF formula packed together in a black travel bag"
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

        <p>This Original Copper Neti Pot&trade; is made of pure copper, which is the material traditionally used for jala neti because of its antimicrobial and healing properties. It is hand-shaped, built to last, and designed for daily routine.</p>

        <p>We believe nasal hygiene belongs alongside brushing your teeth and washing your hands. It is one of the simplest habits you can build, and one of the easiest to overlook.</p>

        <p><strong>Includes:</strong><br />Original Copper Neti Pot&trade;<br />Copper salt scoop<br />Premium microfiber towel</p>

        <p>Receive one free with any approved INF&trade; prescription using referral code <strong>BREATHEDEEPER</strong>.<br />You cover shipping &amp; handling.</p>`
      }
    ]
  };

  win.MACKLEYCatalog = { inf, netiPot };
  const selectedKey = win.document.body?.dataset.productKey || "inf";
  win.MACKLEYProduct = win.MACKLEYCatalog[selectedKey] || inf;
  win.document.documentElement.dataset.productConfig = win.MACKLEYProduct.name;
})(window);

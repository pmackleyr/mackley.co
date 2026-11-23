import { expect, test } from "@playwright/test";

const retailCheckout = "https://buy.stripe.com/7sY00j0Mx6EGdd256idwc05";

test("the storefront fits phone and desktop viewports with JavaScript disabled", async ({ browser }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport, javaScriptEnabled: false });
    for (const route of ["/", "/neti/"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      const navigation = page.getByRole("navigation", { name: "Primary" });
      await expect(navigation.getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "/neti/");
      const buy = navigation.getByRole("link", { name: "Buy now" });
      await expect(buy).toHaveAttribute("href", retailCheckout);
      await expect(buy).toBeInViewport();
      const image = page.getByRole("img", { name: /Pure copper MACKLEY neti pot/i });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBeGreaterThan(0);
      expect(await page.locator("html").evaluate((html) => html.scrollWidth)).toBe(viewport.width);
      await testInfo.attach(`${route === "/" ? "home" : "product"}-${viewport.width}.png`, {
        body: await page.screenshot(),
        contentType: "image/png"
      });
    }
    await page.close();
  }
});

test("the story headlines share one size and the product page shares one left edge", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const headlines = await page.locator(".mk-scene h2, .mk-belief").evaluateAll((elements) => elements.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return { size: getComputedStyle(element).fontSize, textWidth: range.getBoundingClientRect().width, width: element.clientWidth, whiteSpace: getComputedStyle(element).whiteSpace };
    }));
    expect(headlines).toHaveLength(4);
    expect(new Set(headlines.map(({ size }) => size)).size).toBe(1);
    for (const headline of headlines) {
      expect(headline.whiteSpace).toBe("nowrap");
      expect(headline.textWidth).toBeLessThanOrEqual(headline.width + 1);
    }
    await expect(page.getByRole("link", { name: "Close the gap" })).toHaveAttribute("href", "/neti/");
    const prose = await page.locator(".mk-product-intro, .mk-strike").evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return [style.fontSize, style.fontWeight, style.lineHeight];
    }));
    expect(prose[0]).toEqual(prose[1]);
    await expect(page.locator(".mk-header .mk-brand")).toHaveCSS("color", "rgb(247, 5, 0)");
    await expect(page.locator(".mk-header")).toHaveCSS("background-color", "rgba(255, 255, 255, 0.12)");
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Learn more" })).toHaveCSS("color", "rgb(29, 29, 31)");
    const copy = await page.locator(".mk-reveal__copy").boundingBox();
    const gallery = await page.locator(".mk-reveal .mk-gallery").boundingBox();
    expect(copy.width).toBeCloseTo(gallery.width, 0);
    if (width > 800) {
      expect(copy.y + copy.height / 2).toBeCloseTo(gallery.y + gallery.height / 2, 0);
    } else {
      expect(gallery.y + gallery.height).toBeLessThan(copy.y);
    }

    await page.goto("/neti/");
    const essay = page.locator(".mk-essay-copy");
    const steps = essay.getByRole("list");
    await expect(steps.getByRole("listitem")).toHaveText([
      "Add salt,*",
      "Fill with clean water,",
      "Rinse each nostril (one potful is enough for both),",
      "Dry the outside, the inside, then leave upside down to dry completely."
    ]);
    await expect(essay.getByRole("link", { name: "Salt is not included" })).toHaveAttribute("href", "#neti-salt-note");
    await expect(essay.locator("sup").getByRole("link", { name: "Salt is not included" })).toHaveCSS("text-decoration-line", "none");
    await expect(essay.locator("#neti-salt-note")).toHaveText("*not included.");
    await expect(essay).toContainText("Never use water straight from the tap.");
    await expect(essay).toContainText("Hari Om Tat Sat.");
    const edges = await page.locator(".mk-editorial > .mk-gallery, .mk-editorial-opening, .mk-essay-copy, .mk-essay-checkout, .mk-ritual-film, .mk-retail-note, .mk-faq").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
    expect(edges).toHaveLength(7);
    expect(new Set(edges).size).toBe(1);
  }
});

test("both purchase areas show the same price, contents, and return disclosure", async ({ page }) => {
  await page.goto("/");
  const opening = await page.locator(".mk-strike").innerText();
  for (const [route, selector] of [["/", ".mk-reveal__copy"], ["/neti/", ".mk-essay-checkout"]]) {
    await page.goto(route);
    const offer = page.locator(selector);
    await expect(offer.locator(".mk-price")).toHaveText(/\$42\s+U\.S\. delivery included/);
    await expect(offer.locator(".mk-purchase-includes")).toHaveText("400 mL pure copper neti pot and microfiber towel.");
    await expect(offer.getByRole("link", { name: "Buy now" })).toHaveAttribute("href", retailCheckout);
    await expect(offer.locator(".mk-purchase-policy")).toHaveText("No change-of-mind returns.");
  }
  expect(opening.startsWith(await page.locator(".mk-essay-copy .mk-dropcap").innerText())).toBe(true);
  await page.getByText("Where do you ship, and can I return it?", { exact: true }).click();
  await page.getByRole("link", { name: "Read delivery and return details" }).click();
  await expect(page).toHaveURL(/\/policies\/#returns$/);
  await expect(page.locator("#returns")).toBeVisible();
  await expect(page.getByText(/Orders placed before this update/)).toBeVisible();
  await expect(page.getByText(/We will arrange a replacement or refund/)).toBeVisible();
});

test("learn more, keyboard FAQ, and the Stripe handoff work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MACKLEY means REVOLUTION," })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Close the gap" })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Learn more" }).click();
  await expect(page).toHaveURL(/\/neti\/$/);

  const faq = page.locator("#faq");
  const question = faq.getByText("What water and salt should I use?", { exact: true });
  const answer = faq.getByText(/Use distilled or sterile water/);
  await question.focus();
  await question.press("Enter");
  await expect(answer).toBeVisible();
  await expect(answer).toContainText("measured nasal saline mix");
  await question.press("Space");
  await expect(answer).toBeHidden();
  await faq.getByText("How do I clean and dry it?", { exact: true }).click();
  await expect(faq.getByText(/included microfiber towel/)).toBeVisible();
  await expect(faq.getByText(/lemon juice can brighten the outside/)).toBeVisible();

  const checkoutRequest = page.waitForRequest(retailCheckout);
  await page.route(retailCheckout, (route) => route.fulfill({ body: "Mock Stripe checkout" }));
  await page.locator(".mk-essay-checkout").getByRole("link", { name: "Buy now" }).click();
  await checkoutRequest;
  await expect(page).toHaveURL(retailCheckout);
});

test("legacy product routes reach the neti pot and support reaches the FAQ", async ({ page }) => {
  for (const route of ["/product/", "/icanchange/", "/intake/", "/spray-intake/", "/deeper/"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/neti\/$/);
  }
  await page.goto("/support/");
  await expect(page).toHaveURL(/\/neti\/#faq$/);
  await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();
});

test("dashboard exposes purchases, click conversion, and customer state", async ({ page }, testInfo) => {
  await page.goto("/dashboard/", { waitUntil: "networkidle" });
  await expect(page.getByText("Purchases", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Get Prescription clicks", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Contact" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Where" })).toBeVisible();
  await expect(page.locator("#people-rows").getByText("Avery Reed", { exact: true })).toBeVisible();

  const snapshot = JSON.parse(await page.evaluate(() => window.render_app_to_text()));
  expect(snapshot.kpis.purchases).toBe(61);
  expect(snapshot.kpis.netiPotsIncluded).toBe(2);
  expect(snapshot.funnel.map((stage) => stage.label)).toEqual([
    "Landing sessions",
    "Get Prescription clicks",
    "Survey submissions",
    "Purchases"
  ]);
  expect(snapshot.funnel.some((stage) => /neti/i.test(stage.label))).toBe(false);
  expect(snapshot.peopleCount).toBe(12);
  await testInfo.attach("dashboard.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png"
  });
});

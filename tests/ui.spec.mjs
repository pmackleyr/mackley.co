import { expect, test } from "@playwright/test";

async function unlock(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("mackley_access_lock_v1", "unlocked");
  });
}

async function expectVisibleProductImages(page) {
  const images = page.locator(".carousel-image");
  await expect(images).toHaveCount(2);
  const metrics = await images.evaluateAll((nodes) => nodes.map((image) => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    width: image.getBoundingClientRect().width,
    height: image.getBoundingClientRect().height,
    visibility: getComputedStyle(image).visibility
  })));
  for (const image of metrics) {
    expect(image.naturalWidth).toBeGreaterThan(1000);
    expect(image.naturalHeight).toBeGreaterThan(1000);
    expect(image.width).toBeGreaterThan(250);
    expect(image.height).toBeGreaterThan(250);
    expect(image.visibility).toBe("visible");
  }
}

test("product images render at desktop and mobile sizes", async ({ browser }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await unlock(page);
    await page.goto("/icanchange/", { waitUntil: "networkidle" });
    await expectVisibleProductImages(page);
    await testInfo.attach(`product-${viewport.width}.png`, {
      body: await page.screenshot(),
      contentType: "image/png"
    });
    await page.close();
  }
});

test("Neti Pot page renders supplied product images", async ({ browser }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await unlock(page);
    await page.goto("/breathedeeper/", { waitUntil: "networkidle" });
    await expectVisibleProductImages(page);
    await expect(page.getByRole("heading", { name: /Original Copper Neti Pot/i })).toBeVisible();
    await expect(page.getByText(/BREATHEDEEPER/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Get it free with INF" })).toHaveAttribute("href", "/intake/?next=payment&offer=BREATHEDEEPER");
    await testInfo.attach(`neti-pot-${viewport.width}.png`, {
      body: await page.screenshot(),
      contentType: "image/png"
    });
    await page.close();
  }
});

test("BREATHEDEEPER pre-fills the code-gated Neti Pot offer", async ({ page }) => {
  await unlock(page);
  await page.goto("/intake/?next=payment&offer=BREATHEDEEPER", { waitUntil: "networkidle" });
  await expect(page.locator("[data-referral-code-input]")).toHaveValue("BREATHEDEEPER");
  await expect(page.locator("#referral-note")).toContainText("one free Neti Pot after approval");
});

test("home product image renders when the product section is active", async ({ page }, testInfo) => {
  await unlock(page);
  await page.goto("/", { waitUntil: "networkidle" });
  const activeProduct = page.locator("#product-b");
  await activeProduct.scrollIntoViewIfNeeded();
  await expect(activeProduct.locator(".carousel-image").first()).toBeVisible();
  const size = await activeProduct.locator(".carousel-image").first().evaluate((image) => ({
    naturalWidth: image.naturalWidth,
    width: image.getBoundingClientRect().width
  }));
  expect(size.naturalWidth).toBeGreaterThan(1000);
  expect(size.width).toBeGreaterThan(250);
  await testInfo.attach("home-product.png", {
    body: await page.screenshot(),
    contentType: "image/png"
  });
});

test("home Neti Pot section is the final snap section", async ({ page }, testInfo) => {
  await unlock(page);
  await page.goto("/", { waitUntil: "networkidle" });
  const activeNarrative = page.locator(".narrative:visible");
  const netiSection = activeNarrative.locator(".home-neti");
  await netiSection.evaluate((target) => {
    const narrative = target.closest(".narrative");
    narrative.scrollTop = target.offsetTop - ((narrative.clientHeight - target.clientHeight) / 2);
    narrative.dispatchEvent(new Event("scroll"));
  });
  await expect(netiSection).toHaveClass(/active/);
  await expect(netiSection.getByRole("heading", { name: /Original Copper Neti Pot/i })).toBeVisible();
  await expect(netiSection.locator(".carousel-image").first()).toBeVisible();
  await expect(netiSection.getByText(/BREATHEDEEPER/i)).toBeVisible();
  await expect(page.locator(".scroll-guide__tick")).toHaveCount(4);
  await testInfo.attach("home-neti-section.png", {
    body: await page.screenshot(),
    contentType: "image/png"
  });
});

test("legacy product route redirects to icanchange", async ({ page }) => {
  await unlock(page);
  await page.goto("/product/?source=legacy");
  await expect(page).toHaveURL(/\/icanchange\/\?source=legacy$/);
});

test("mobile pages expose one primary commerce CTA without scrolling", async ({ browser }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    for (const route of ["/", "/icanchange/", "/breathedeeper/"]) {
      const page = await browser.newPage({ viewport });
      await unlock(page);
      await page.goto(route, { waitUntil: "networkidle" });

      const ctas = page.locator("a[data-product-buy]");
      const visibleBounds = await ctas.evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth
        };
      }).filter((rect) => (
        rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.top < rect.viewportHeight
        && rect.right > 0
        && rect.left < rect.viewportWidth
      )));
      expect(visibleBounds).toHaveLength(1);
      const [bounds] = visibleBounds;

      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
      expect(bounds.documentWidth).toBe(bounds.viewportWidth);

      const routeName = route === "/" ? "home" : route.split("/").filter(Boolean)[0];
      await testInfo.attach(`mobile-cta-${routeName}-${viewport.width}.png`, {
        body: await page.screenshot(),
        contentType: "image/png"
      });
      await page.close();
    }
  }
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

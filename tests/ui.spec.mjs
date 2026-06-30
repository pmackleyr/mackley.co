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
    await page.goto("/product/", { waitUntil: "networkidle" });
    await expectVisibleProductImages(page);
    await testInfo.attach(`product-${viewport.width}.png`, {
      body: await page.screenshot(),
      contentType: "image/png"
    });
    await page.close();
  }
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
  expect(snapshot.funnel.map((stage) => stage.label)).toEqual([
    "Landing sessions",
    "Get Prescription clicks",
    "Survey submissions",
    "Purchases"
  ]);
  expect(snapshot.peopleCount).toBe(12);
  await testInfo.attach("dashboard.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png"
  });
});

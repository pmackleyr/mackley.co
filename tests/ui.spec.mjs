import { expect, test } from "@playwright/test";

const retailCheckout = "https://buy.stripe.com/7sY00j0Mx6EGdd256idwc05";

test("the storefront fits phone and desktop viewports with JavaScript disabled", async ({ browser }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport, javaScriptEnabled: false });
    for (const route of ["/", "/breathedeeper/"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: "Pure Copper Neti Pot" })).toBeVisible();
      const navigation = page.getByRole("navigation", { name: "Primary" });
      await expect(navigation.getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "/breathedeeper/");
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

test("learn more, keyboard FAQ, and the Stripe handoff work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/If you can change how you think/)).toBeVisible();
  await expect(page.getByText("We believe you can.")).toBeVisible();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Learn more" }).click();
  await expect(page).toHaveURL(/\/breathedeeper\/$/);

  const question = page.getByText("What water should I use?", { exact: true });
  await question.focus();
  await question.press("Enter");
  await expect(page.getByText(/Use distilled or sterile water/)).toBeVisible();
  await question.press("Space");
  await expect(page.getByText(/Use distilled or sterile water/)).toBeHidden();

  const checkoutRequest = page.waitForRequest(retailCheckout);
  await page.route(retailCheckout, (route) => route.fulfill({ body: "Mock Stripe checkout" }));
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Buy now" }).click();
  await checkoutRequest;
  await expect(page).toHaveURL(retailCheckout);
});

test("legacy product routes reach the neti pot and support reaches the FAQ", async ({ page }) => {
  for (const route of ["/product/", "/icanchange/", "/intake/", "/spray-intake/", "/deeper/"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/breathedeeper\/$/);
  }
  await page.goto("/support/");
  await expect(page).toHaveURL(/\/breathedeeper\/#faq$/);
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

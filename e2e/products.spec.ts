import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://dummyjson.com/products?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const skip = Number(params.get("skip"));
    return route.fulfill({
      json: {
        products: Array.from({ length: 12 }, (_, index) => ({
          id: skip + index,
          title: `${params.get("sortBy")} ${params.get("order")} product ${skip + index}`,
          category: "home",
          price: 25,
          rating: 4.2,
          thumbnail:
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        })),
        total: 36,
        skip,
        limit: 12,
      },
    });
  });
});

test("shared URLs, refresh, Back and Forward restore sorting and results", async ({
  page,
}) => {
  await page.goto("/?page=2&sortBy=price&order=desc");
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveValue("price-desc");
  await expect(
    page.getByRole("heading", { name: "price desc product 12", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "price desc product 12", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox").selectOption("rating-asc");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("combobox")).toHaveValue("price-desc");
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("combobox")).toHaveValue("rating-asc");
  await expect(
    page.getByRole("heading", { name: "rating asc product 0", exact: true }),
  ).toBeVisible();
});

test("375px layout fits, expands on desktop, and page changes scroll to results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  const first = await page.getByRole("article").nth(0).boundingBox();
  const second = await page.getByRole("article").nth(1).boundingBox();
  expect(first!.x).toBe(second!.x);
  expect(second!.y).toBeGreaterThan(first!.y);
  await page.getByRole("combobox").focus();
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page
          .getByRole("heading", { name: "Products", exact: true })
          .boundingBox())!.y,
    )
    .toBeLessThan(100);
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopFirst = await page.getByRole("article").nth(0).boundingBox();
  const desktopSecond = await page.getByRole("article").nth(1).boundingBox();
  expect(desktopFirst!.y).toBe(desktopSecond!.y);
  expect(desktopSecond!.x).toBeGreaterThan(desktopFirst!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1280,
  );
});


test("shared search survives refresh and history restores search controls and results", async ({ page }) => {
  await page.route("https://dummyjson.com/products/search?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: {
      products: [{ id: 1, title: `Match for ${params.get("q")}`, category: "home", price: 25, rating: 4.2, thumbnail: "https://example.com/lamp.jpg" }],
      total: 36, skip: Number(params.get("skip")), limit: 12,
    } });
  });
  await page.goto("/?q=lamp&page=2&sortBy=price&order=desc");
  const input = page.getByRole("searchbox", { name: "Search products" });
  await expect(input).toHaveValue("lamp");
  await expect(page.getByRole("heading", { name: "Match for lamp" })).toBeVisible();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue("lamp");
  await expect(page.getByRole("heading", { name: "Match for lamp" })).toBeVisible();
  await page.getByRole("combobox").selectOption("rating-asc");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await input.fill("headphones");
  await expect(page.getByRole("heading", { name: "Match for headphones" })).toBeVisible();
  await page.goBack();
  await expect(input).toHaveValue("lamp");
  await expect(page.getByRole("combobox")).toHaveValue("price-desc");
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Match for lamp" })).toBeVisible();
  await page.goForward();
  await expect(input).toHaveValue("headphones");
  await expect(page.getByRole("combobox")).toHaveValue("rating-asc");
  await expect(page.getByRole("heading", { name: "Match for headphones" })).toBeVisible();
});

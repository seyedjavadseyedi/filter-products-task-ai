import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://dummyjson.com/products/category-list", (route) => route.fulfill({ json: ["beauty", "home"] }));
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
  await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue("price-desc");
  await expect(
    page.getByRole("heading", { name: "price desc product 12", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "price desc product 12", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("rating-asc");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue("price-desc");
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue("rating-asc");
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
  await page.getByRole("combobox", { name: "Sort products" }).focus();
  await expect(page.getByRole("combobox", { name: "Sort products" })).toBeFocused();
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
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("rating-asc");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await input.fill("headphones");
  await expect(page.getByRole("heading", { name: "Match for headphones" })).toBeVisible();
  await page.goBack();
  await expect(input).toHaveValue("lamp");
  await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue("price-desc");
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Match for lamp" })).toBeVisible();
  await page.goForward();
  await expect(input).toHaveValue("headphones");
  await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue("rating-asc");
  await expect(page.getByRole("heading", { name: "Match for headphones" })).toBeVisible();
});


test("category shared URL, refresh and history restore controls at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.route("https://dummyjson.com/products/category/*?*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: {
      products: [{ id: 1, title: `${url.pathname.split("/").pop()} product`, category: "beauty", price: 25, rating: 4, thumbnail: "https://example.com/product.jpg" }],
      total: 36, skip: Number(url.searchParams.get("skip")), limit: 12,
    } });
  });
  await page.goto("/?category=beauty&page=2&sortBy=price&order=desc");
  const category = page.getByRole("combobox", { name: "Category" });
  await expect(category).toHaveValue("beauty");
  await expect(page.getByRole("heading", { name: "beauty product" })).toBeVisible();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.reload();
  await expect(category).toHaveValue("beauty");
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  for (const control of [category, page.getByRole("searchbox"), page.getByRole("combobox", { name: "Sort products" })]) {
    const box = await control.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await control.focus();
    await expect(control).toBeFocused();
  }
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
  await category.selectOption("");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.goBack();
  await expect(category).toHaveValue("beauty");
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
  await page.goForward();
  await expect(category).toHaveValue("");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
});

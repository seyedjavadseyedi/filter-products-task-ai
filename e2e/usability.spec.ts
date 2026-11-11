import { expect, test } from "@playwright/test";

const product = {
  id: 1,
  title: "A long product title " + "UnbrokenProductName".repeat(12),
  category: "home",
  price: 25,
  rating: 4.2,
  thumbnail: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
};

test("keyboard users can choose a category, sort, paginate and search", async ({ page }) => {
  await page.route("https://dummyjson.com/products/category-list", (route) => route.fulfill({ json: ["home"] }));
  await page.route("https://dummyjson.com/products**", (route) => {
    if (new URL(route.request().url()).pathname === "/products/category-list") return route.fallback();
    return route.fulfill({ json: { products: [{ ...product, title: "Keyboard product" }], total: 24, skip: 0, limit: 12 } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Keyboard product" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toBeEnabled();
  await page.getByRole("searchbox").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(page).toHaveURL(/category=home/);
  await expect(page.getByRole("combobox", { name: "Sort products" })).toBeFocused();
  const sorted = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/products/category/home" &&
      url.searchParams.get("sortBy") === "rating" && url.searchParams.get("order") === "desc";
  });
  await page.keyboard.press("End");
  await (await sorted).finished();
  await expect(page).toHaveURL(/sortBy=rating&order=desc/);
  await expect(page.getByText("Loading products...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page.getByRole("searchbox").focus();
  await page.keyboard.type("lamp");
  await expect(page).toHaveURL(/q=lamp/);
  await expect(page).not.toHaveURL(/category=/);
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
});

test("mobile loading, failure and keyboard Retry recover without overflowing long content", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.route("https://dummyjson.com/products/category-list", (route) => route.fulfill({ json: ["home"] }));
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let failing = true;
  await page.route("https://dummyjson.com/products?*", async (route) => {
    await pending;
    await route.fulfill(failing ? { status: 503, body: "Unavailable" } : {
      json: { products: [product], total: 24, skip: 0, limit: 12 },
    });
  });
  await page.goto("/?sortBy=price&order=desc");
  await expect(page.getByRole("status")).toHaveText("Loading products...");
  await page.screenshot({ path: testInfo.outputPath("loading.png") });
  release();
  await expect(page.getByRole("alert")).toContainText("Unable to load products");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("error.png") });
  failing = false;
  await page.getByRole("button", { name: "Retry", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: product.title, exact: true })).toBeVisible();
  await expect(page).toHaveURL("/?sortBy=price&order=desc");
  await expect(page.getByRole("img")).toHaveAttribute("alt", product.title);
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: testInfo.outputPath("long-content.png"), fullPage: true });
});

test("category failure preserves the view, Retry restores categories and offline feedback recovers", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 700 });
  let categoriesFail = true;
  await page.route("https://dummyjson.com/products/category-list", (route) => route.fulfill(
    categoriesFail ? { status: 503, body: "Unavailable" } : { json: ["home"] },
  ));
  await page.route("https://dummyjson.com/products/category/home?*", (route) => route.fulfill({
    json: { products: [{ ...product, title: "Home product" }], total: 1, skip: 0, limit: 12 },
  }));
  await page.goto("/?category=home");
  await expect(page.getByRole("heading", { name: "Home product" })).toBeVisible();
  await expect(page.getByText("Categories unavailable")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("home");
  await expect(page.getByRole("searchbox")).toBeEnabled();
  await expect(page.getByRole("combobox", { name: "Sort products" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("category-error.png") });
  categoriesFail = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toBeEnabled();
  await expect(page).toHaveURL("/?category=home");
  await context.setOffline(true);
  await expect(page.getByText("You appear to be offline.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("offline.png") });
  await context.setOffline(false);
  await expect(page.getByText("You appear to be offline.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Home product" })).toBeVisible();
});

test("empty results give labelled feedback without pagination", async ({ page }, testInfo) => {
  await page.route("https://dummyjson.com/products/category-list", (route) => route.fulfill({ json: ["home"] }));
  await page.route("https://dummyjson.com/products/search?*", (route) => route.fulfill({
    json: { products: [], total: 0, skip: 0, limit: 12 },
  }));
  await page.goto("/?q=no-match");
  await expect(page.getByRole("searchbox", { name: "Search products" })).toHaveValue("no-match");
  await expect(page.getByRole("status")).toHaveText("No products found.");
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Results pages" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("empty.png") });
});

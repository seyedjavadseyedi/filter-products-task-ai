import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Optional live check: start Vite first, then run node scripts/verify-live.mjs.
// Kept outside the deterministic suite because DummyJSON and its catalog can change.
const output = "test-results/live-verification";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 700 } });
  const page = await context.newPage();
  const evidence = { date: new Date().toISOString(), views: [], screenshots: [] };
  for (const view of [
    { name: "list", query: "", path: "/products" },
    { name: "search", query: "q=phone", path: "/products/search", search: "phone" },
    { name: "category", query: "category=smartphones", path: "/products/category/smartphones" },
  ]) {
    for (const sortBy of ["title", "price", "rating"]) {
      for (const order of ["asc", "desc"]) {
        const params = new URLSearchParams({ limit: "0", sortBy, order });
        if (view.search) params.set("q", view.search);
        const baselineResponse = await context.request.get(`https://dummyjson.com${view.path}?${params}`);
        assert.equal(baselineResponse.status(), 200);
        const baseline = await baselineResponse.json();
        assert.ok(baseline.total > 12, `${view.name} needs a second page`);
        const values = baseline.products.map((product) => product[sortBy]);
        // Numeric ordering is unambiguous; title collation belongs to the API.
        for (let index = 1; sortBy !== "title" && index < values.length; index++) {
          const comparison = values[index - 1] - values[index];
          assert.ok(order === "asc" ? comparison <= 0 : comparison >= 0,
            `${view.name}: API ${sortBy} ${order}`);
        }
        for (const number of [1, 2]) {
          const responsePromise = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return url.origin === "https://dummyjson.com" && url.pathname === view.path &&
              url.searchParams.get("skip") === String((number - 1) * 12);
          });
          await page.goto(`http://127.0.0.1:5173/?${view.query}&page=${number}&sortBy=${sortBy}&order=${order}`);
          const response = await responsePromise;
          assert.equal(response.status(), 200);
          const data = await response.json();
          const expected = baseline.products.slice((number - 1) * 12, number * 12);
          assert.equal(data.total, baseline.total);
          assert.deepEqual(data.products.map((product) => product.id), expected.map((product) => product.id));
          await expect(page.getByRole("article").getByRole("heading")).toHaveText(expected.map((product) => product.title));
          await expect(page.getByText(`Page ${number} of ${Math.ceil(data.total / 12)}`, { exact: true })).toBeVisible();
          await expect(page.getByRole("searchbox")).toHaveValue(view.search ?? "");
          await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue(view.name === "category" ? "smartphones" : "");
          await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue(`${sortBy}-${order}`);
          for (const [index, product] of expected.entries()) {
            const card = page.getByRole("article").nth(index);
            await expect(card.getByRole("img")).toHaveAttribute("alt", product.title);
            await expect(card).toContainText(product.category);
            await expect(card).toContainText(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(product.price));
            await expect(card).toContainText(`Rating: ${product.rating} / 5`);
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
          evidence.views.push({ view: view.name, sortBy, order, page: number, total: data.total, ids: data.products.map((product) => product.id) });
        }
      }
    }
  }
  await page.goto("http://127.0.0.1:5173/?q=HEADPHONES");
  const descriptionResponse = await context.request.get("https://dummyjson.com/products/search?q=HEADPHONES&limit=0");
  assert.equal(descriptionResponse.status(), 200);
  const descriptionData = await descriptionResponse.json();
  assert.ok(descriptionData.products.some((product) => !product.title.toLowerCase().includes("headphones") && product.description.toLowerCase().includes("headphones")));
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(descriptionData.products.map((product) => product.title));
  evidence.descriptionMatches = descriptionData.products.map(({ id, title }) => ({ id, title }));
  for (const [path, ignored] of [
    ["/products/category/beauty", "q=phone"],
    ["/products/search?q=phone", "category=beauty"],
  ]) {
    const url = `https://dummyjson.com${path}${path.includes("?") ? "&" : "?"}limit=0`;
    const normal = await context.request.get(url);
    const combined = await context.request.get(`${url}&${ignored}`);
    assert.equal(normal.status(), 200);
    assert.equal(combined.status(), 200);
    assert.deepEqual(await combined.json(), await normal.json());
  }
  evidence.apiLimitation = "Category route ignores q; search route ignores category.";
  await page.goto("http://127.0.0.1:5173/?q=zzzz-issue6-no-match-987654321");
  await expect(page.getByText("No products found.", { exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.goto("http://127.0.0.1:5173/?q=HEADPHONES");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(descriptionData.products.map((product) => product.title));
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("smartphones");
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page).not.toHaveURL(/q=/);
  await page.getByRole("searchbox").fill("phone");
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("");
  await expect(page).not.toHaveURL(/category=/);
  await page.goto("http://127.0.0.1:5173/");
  await expect(page.getByRole("article")).toHaveCount(12);
  await page.getByRole("img").first().evaluate((img) => img.decode());
  await page.screenshot({ path: `${output}/mobile.png` });
  await page.getByRole("searchbox").focus();
  await page.screenshot({ path: `${output}/keyboard-focus.png` });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Sort products" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue("rating-desc");
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Page 2 of/)).toBeVisible();
  await expect(page.getByText("Loading products...")).toHaveCount(0);
  await expect.poll(async () => {
    const y = (await page.getByRole("heading", { name: "Products", exact: true }).boundingBox()).y;
    return y >= 0 && y < 100;
  }).toBe(true);
  await page.screenshot({ path: `${output}/mobile-page-2.png` });
  await page.reload();
  await expect(page.getByText(/Page 2 of/)).toBeVisible();
  await page.goto("http://127.0.0.1:5173/");
  await expect(page.getByRole("article")).toHaveCount(12);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("img").evaluateAll((images) =>
    Promise.all(images.slice(0, 3).map((image) => image.decode())));
  await page.screenshot({ path: `${output}/desktop.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1280);
  evidence.screenshots = ["mobile.png", "keyboard-focus.png", "mobile-page-2.png", "desktop.png"];
  await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(`Verified ${evidence.views.length} live views, description matching, exclusive controls, keyboard pagination and refresh. Evidence: ${output}`);
} finally {
  await browser.close();
}

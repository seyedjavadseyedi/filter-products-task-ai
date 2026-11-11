import { test, expect, type Page } from "@playwright/test";

const testWithApi = test.extend<{ requests: URL[] }>({
  requests: async ({ page }, use) => {
    const requests: URL[] = [];
    await page.route("https://dummyjson.com/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/products/category-list") {
        await route.fulfill({ json: ["beauty", "home"] });
        return;
      }
      requests.push(url);
      const params = url.searchParams;
      const skip = Number(params.get("skip"));
      const view = params.get("q") ?? url.pathname.split("/")[3] ?? "all";
      await route.fulfill({ json: {
        products: [{ id: skip + 1,
          title: `${view}: ${params.get("sortBy")} ${params.get("order")} at ${skip}`,
          category: "home", price: 25, rating: 4,
          thumbnail: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        }], total: 36, skip, limit: 12,
      } });
    });
    await use(requests);
  },
});

async function expectView(page: Page, search: string, category: string, sort: string,
  pageNumber: number, title: string) {
  await expect(page.getByRole("searchbox")).toHaveValue(search);
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue(category);
  await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue(sort);
  await expect(page.getByText(`Page ${pageNumber} of 3`)).toBeVisible();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

for (const view of [
  { query: "q=lamp", search: "lamp", category: "", path: "/products/search", title: "lamp: price desc at 12" },
  { query: "category=beauty", search: "", category: "beauty", path: "/products/category/beauty", title: "beauty: price desc at 12" },
]) {
  testWithApi(`shared ${view.query} restores UI, URL and requests after refresh`, async ({ page, requests }) => {
    const shared = `/?${view.query}&page=2&sortBy=price&order=desc`;
    await page.goto(shared);
    for (let visit = 0; visit < 2; visit++) {
      if (visit) await page.reload();
      await expectView(page, view.search, view.category, "price-desc", 2, view.title);
      await expect(page).toHaveURL(shared);
      const request = requests.at(-1)!;
      expect(request.pathname).toBe(view.path);
      expect(Object.fromEntries(request.searchParams)).toEqual({
        limit: "12", skip: "12", sortBy: "price", order: "desc",
        ...(view.search ? { q: "lamp" } : {}),
      });
      await expect(page.getByRole("button", { name: "Previous" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    }
    expect(requests).toHaveLength(2);
  });
}

testWithApi("Back and Forward cancel pending edits across category, sort and page history", async ({ page, requests }) => {
  await page.clock.install();
  await page.goto("/?q=lamp");
  await expectView(page, "lamp", "", "title-asc", 1, "lamp: title asc at 0");
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("beauty");
  await expectView(page, "", "beauty", "title-asc", 1, "beauty: title asc at 0");
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("price-desc");
  await expectView(page, "", "beauty", "price-desc", 1, "beauty: price desc at 0");
  await page.getByRole("button", { name: "Next" }).click();
  await expectView(page, "", "beauty", "price-desc", 2, "beauty: price desc at 12");
  await page.clock.pauseAt(new Date(Date.now() + 10_000));
  await page.getByRole("searchbox").fill("discard on Back");
  await page.goBack();
  await expectView(page, "", "beauty", "price-desc", 1, "beauty: price desc at 0");
  const backUrl = page.url();
  await page.clock.runFor(1000);
  await expect(page).toHaveURL(backUrl);
  await expectView(page, "", "beauty", "price-desc", 1, "beauty: price desc at 0");
  await page.getByRole("searchbox").fill("discard on Forward");
  await page.goForward();
  await expectView(page, "", "beauty", "price-desc", 2, "beauty: price desc at 12");
  const forwardUrl = page.url();
  await page.clock.runFor(1000);
  await expect(page).toHaveURL(forwardUrl);
  await expectView(page, "", "beauty", "price-desc", 2, "beauty: price desc at 12");
  expect(requests.some((url) => url.searchParams.get("q")?.startsWith("discard"))).toBe(false);
  await page.goBack();
  await page.goBack();
  await expectView(page, "", "beauty", "title-asc", 1, "beauty: title asc at 0");
  await page.goBack();
  await expectView(page, "lamp", "", "title-asc", 1, "lamp: title asc at 0");
  await page.goForward();
  await expectView(page, "", "beauty", "title-asc", 1, "beauty: title asc at 0");
});

testWithApi("debounced phrases replace one history entry", async ({ page, requests }) => {
  await page.clock.install();
  await page.goto("/?category=home");
  await expectView(page, "", "home", "title-asc", 1, "home: title asc at 0");
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("rating-desc");
  await expectView(page, "", "home", "rating-desc", 1, "home: rating desc at 0");
  for (const phrase of ["lamp", "desk lamp"]) {
    await page.getByRole("searchbox").fill(phrase);
    await expectView(page, phrase, "", "rating-desc", 1, `${phrase}: rating desc at 0`);
  }
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
    q: "desk lamp", page: "1", sortBy: "rating", order: "desc",
  });
  expect(Object.fromEntries(requests.at(-1)!.searchParams)).toEqual({
    q: "desk lamp", skip: "0", limit: "12", sortBy: "rating", order: "desc",
  });
  await page.goBack();
  await expect(page).toHaveURL("/?category=home");
  await expectView(page, "", "home", "title-asc", 1, "home: title asc at 0");
  await page.goForward();
  await expectView(page, "desk lamp", "", "rating-desc", 1, "desk lamp: rating desc at 0");
});

for (const malformed of [
  { query: "q=lamp&category=beauty&page=-2&sortBy=unknown&order=sideways",
    canonical: "q=lamp&page=1&sortBy=title&order=asc", search: "lamp", title: "lamp: title asc at 0" },
  { query: "category=missing&page=999&sortBy=price&order=desc",
    canonical: "page=3&sortBy=price&order=desc", search: "", title: "all: price desc at 24" },
]) {
  testWithApi(`normalization replaces history for ${malformed.query}`, async ({ page, requests }) => {
    await page.goto("/?category=home");
    await expectView(page, "", "home", "title-asc", 1, "home: title asc at 0");
    // A same-origin link creates a real browser entry for a malformed shared URL.
    await page.evaluate((query) => {
      const link = document.createElement("a");
      link.href = `/?${query}`;
      link.textContent = "Open shared view";
      document.body.append(link);
    }, malformed.query);
    await page.getByRole("link", { name: "Open shared view" }).click();
    await expect(page).toHaveURL(`/?${malformed.canonical}`);
    const lastPage = malformed.search ? 1 : 3;
    const sort = malformed.search ? "title-asc" : "price-desc";
    await expectView(page, malformed.search, "", sort, lastPage, malformed.title);
    const request = requests.at(-1)!;
    expect(request.pathname).toBe(malformed.search ? "/products/search" : "/products");
    expect(Object.fromEntries(request.searchParams)).toEqual(malformed.search
      ? { q: "lamp", limit: "12", skip: "0", sortBy: "title", order: "asc" }
      : { limit: "12", skip: "24", sortBy: "price", order: "desc" });
    await page.goBack();
    await expect(page).toHaveURL("/?category=home");
    await expectView(page, "", "home", "title-asc", 1, "home: title asc at 0");
    await page.goForward();
    await expect(page).toHaveURL(`/?${malformed.canonical}`);
    await expectView(page, malformed.search, "", sort, lastPage, malformed.title);
  });
}

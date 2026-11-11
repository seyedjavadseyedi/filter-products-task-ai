import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ProductBrowser } from "./ProductBrowser";

afterEach(() => vi.unstubAllGlobals());
test("debounces search into the URL while results and pagination follow the applied view", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply("Description match")));
  stubProducts("fetch", fetch);
  const router = mount("/?page=2&sortBy=price&order=desc");
  await screen.findByText("Description match");
  vi.useFakeTimers();
  try {
    fireEvent.change(screen.getByRole("searchbox", { name: "Search products" }), { target: { value: "headphones" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(router.state.location.search).toBe("?page=2&sortBy=price&order=desc");
    expect(screen.getByText("Description match")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe("headphones");
    expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products/search?limit=12&skip=0&sortBy=price&order=desc&q=headphones");
  } finally { vi.useRealTimers(); }
});
test("renders product information in API order and requests the default product view", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        products: [
          {
            id: 1,
            title: "Zebra lamp",
            category: "home",
            price: 25,
            rating: 4.2,
            thumbnail: "https://example.com/lamp.jpg",
          },
          {
            id: 2,
            title: "Apple lamp",
            category: "home",
            price: 12,
            rating: 3,
            thumbnail: "https://example.com/apple.jpg",
          },
        ],
        total: 24,
        skip: 0,
        limit: 12,
      }),
    ),
  );
  stubProducts("fetch", fetch);
  mount();
  expect(
    await screen.findByRole("heading", { name: "Zebra lamp" }),
  ).toBeVisible();
  expect(
    screen.getAllByRole("article").map((card) => card.textContent),
  ).toEqual([
    expect.stringContaining("Zebra lamp"),
    expect.stringContaining("Apple lamp"),
  ]);
  expect(screen.getByRole("img", { name: "Zebra lamp" })).toHaveAttribute(
    "src",
    "https://example.com/lamp.jpg",
  );
  expect(screen.getByText("$25.00")).toBeVisible();
  expect(screen.getByText("Rating: 4.2 / 5")).toBeVisible();
  expect(screen.getByText("Page 1 of 2")).toBeVisible();
  expect(String(fetch.mock.calls[0][0])).toBe(
    "https://dummyjson.com/products?limit=12&skip=0&sortBy=title&order=asc",
  );
});

function mount(url = "/") {
  const router = createMemoryRouter(
    [{ path: "/", element: <ProductBrowser /> }],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
function reply(title = "Lamp", total = 25) {
  return new Response(
    JSON.stringify({
      products: [
        {
          id: 1,
          title,
          category: "home",
          price: 25,
          rating: 4.2,
          thumbnail: "https://example.com/lamp.jpg",
        },
      ],
      total,
      skip: 0,
      limit: 12,
    }),
  );
}
test.each([
  ["title-asc", "title", "asc"],
  ["title-desc", "title", "desc"],
  ["price-asc", "price", "asc"],
  ["price-desc", "price", "desc"],
  ["rating-asc", "rating", "asc"],
  ["rating-desc", "rating", "desc"],
])(
  "applies %s from the URL and resets page when sorting",
  async (value, field, order) => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply()));
    stubProducts("fetch", fetch);
    const router = mount("/?page=2&sortBy=rating&order=desc");
    await screen.findByText("Page 2 of 3");
    expect(screen.getByRole("combobox", { name: "Sort products" })).toHaveValue(
      "rating-desc",
    );
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort products" }), value);
    await screen.findByText("Page 1 of 3");
    expect(router.state.location.search).toContain("page=1");
    expect(String(fetch.mock.lastCall?.[0])).toBe(
      `https://dummyjson.com/products?limit=12&skip=0&sortBy=${field}&order=${order}`,
    );
  },
);
test("navigates pages, preserves cards while loading, and disables boundaries", async () => {
  let finish!: (response: Response) => void;
  stubProducts(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(reply("First", 13))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(() => Promise.resolve(reply("First", 13))),
  );
  const router = mount();
  await screen.findByText("Page 1 of 2");
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("First")).toBeVisible();
  expect(await screen.findByText(/Loading products/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  finish(reply("Second", 13));
  await screen.findByText("Second");
  expect(screen.getByText("Page 2 of 2")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(router.state.location.search).toContain("page=2");
  await userEvent.click(screen.getByRole("button", { name: "Previous" }));
  await screen.findByText("Page 1 of 2");
});

test.each(["0", "-1", "1.5", "abc", "9007199254740992"])(
  "replaces invalid page %s and invalid sorting",
  async (page) => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply()));
    stubProducts("fetch", fetch);
    const router = mount(`/?page=${page}&sortBy=unknown&order=wrong`);
    await screen.findByText("Page 1 of 3");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.search).toBe("?page=1&sortBy=title&order=asc");
    expect(String(fetch.mock.calls[0][0])).toContain(
      "skip=0&sortBy=title&order=asc",
    );
  },
);
test("replaces an out-of-range page and fetches the last page", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply()));
  stubProducts("fetch", fetch);
  const router = mount("/?page=99");
  await waitFor(() => expect(router.state.location.search).toBe("?page=3"));
  expect(router.state.historyAction).toBe("REPLACE");
  await waitFor(() =>
    expect(String(fetch.mock.lastCall?.[0])).toContain("skip=24"),
  );
});
test("shows initial loading and empty results, correcting zero results to page one", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ products: [], total: 0 }))),
    );
  stubProducts("fetch", fetch);
  const router = mount("/?page=8");
  expect(screen.getByText(/Loading products/)).toBeVisible();
  finish(new Response(JSON.stringify({ products: [], total: 0 })));
  await screen.findByText("No products found.");
  await waitFor(() => expect(router.state.location.search).toBe("?page=1"));
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});
test("hides stale cards after a failed page request and retries the preserved view", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply("Old"))
    .mockResolvedValueOnce(new Response("", { status: 500 }))
    .mockResolvedValueOnce(reply("Recovered"));
  stubProducts("fetch", fetch);
  const router = mount();
  await screen.findByText("Old");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("Old")).not.toBeInTheDocument();
  expect(router.state.location.search).toBe("?page=2");
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Recovered");
  expect(String(fetch.mock.lastCall?.[0])).toContain("skip=12");
});
test("reports browser offline state and updates on reconnection", async () => {
  stubProducts(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(reply())),
  );
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  mount();
  expect(screen.getByText("You appear to be offline.")).toBeVisible();
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  await screen.findByText("Lamp");
  expect(
    screen.queryByText("You appear to be offline."),
  ).not.toBeInTheDocument();
  online.mockRestore();
});
test("superseded responses cannot overwrite the latest sort and history restores the view", async () => {
  let finish!: (response: Response) => void;
  stubProducts(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(() => Promise.resolve(reply("Current"))),
  );
  const router = mount();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort products" }), "price-desc");
  await screen.findByText("Current");
  await act(async () => {
    finish(reply("Superseded"));
  });
  expect(screen.queryByText("Superseded")).not.toBeInTheDocument();
  expect(router.state.historyAction).toBe("PUSH");
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole("combobox", { name: "Sort products" })).toHaveValue("title-asc");
  await act(async () => {
    await router.navigate(1);
  });
  expect(screen.getByRole("combobox", { name: "Sort products" })).toHaveValue("price-desc");
});

test("keeps offline pagination pending until the requested page succeeds", async () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  stubProducts(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(reply("First", 36))),
  );
  const router = mount();
  await screen.findByText("Page 1 of 3");
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => window.dispatchEvent(new Event("offline")));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(router.state.location.search).toBe("?page=2");
  expect(screen.getByText("First")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  expect(screen.getByText(/Loading products/)).toBeVisible();
  expect(scroll).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  expect(scroll).toHaveBeenCalledOnce();
  scroll.mockRestore();
  online.mockRestore();
});


test("shared search requests API matches, paginates, and clears while preserving sort", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply("Description-only match")));
  stubProducts("fetch", fetch);
  const router = mount("/?q=HEADPHONES&page=2&sortBy=rating&order=desc");
  await screen.findByText("Description-only match");
  expect(screen.getByRole("searchbox")).toHaveValue("HEADPHONES");
  expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products/search?limit=12&skip=12&sortBy=rating&order=desc&q=HEADPHONES");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Page 3 of 3");
  expect(String(fetch.mock.lastCall?.[0])).toContain("skip=24&sortBy=rating&order=desc&q=HEADPHONES");
  await userEvent.clear(screen.getByRole("searchbox"));
  await waitFor(() => expect(router.state.location.search).toBe("?page=1&sortBy=rating&order=desc"));
  await waitFor(() => expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products?limit=12&skip=0&sortBy=rating&order=desc"));
  expect(router.state.historyAction).toBe("REPLACE");
});

test("sorting commits pending text once and history navigation cancels edits in both directions", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply()));
  stubProducts("fetch", fetch);
  const router = mount("/?q=old&page=2");
  await screen.findByText("Lamp");
  vi.useFakeTimers();
  try {
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort products" }), { target: { value: "price-desc" } });
    expect(router.state.historyAction).toBe("PUSH");
    expect(router.state.location.search).toBe("?q=new&page=1&sortBy=price&order=desc");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(router.state.historyAction).toBe("PUSH");
    fireEvent.change(input, { target: { value: "discard on back" } });
    await act(async () => { await router.navigate(-1); });
    expect(input).toHaveValue("old");
    expect(screen.getByRole("combobox", { name: "Sort products" })).toHaveValue("title-asc");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(router.state.location.search).toBe("?q=old&page=2");
    fireEvent.change(input, { target: { value: "discard on forward" } });
    await act(async () => { await router.navigate(1); });
    expect(input).toHaveValue("new");
    expect(screen.getByRole("combobox", { name: "Sort products" })).toHaveValue("price-desc");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(router.state.location.search).toBe("?q=new&page=1&sortBy=price&order=desc");
    expect(String(fetch.mock.lastCall?.[0])).not.toContain("discard");
  } finally { vi.useRealTimers(); }
});

test("superseded searches cannot overwrite current results or retain old cards during new-search loading", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn()
    .mockResolvedValueOnce(reply("Original"))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce(reply("Latest"));
  stubProducts("fetch", fetch);
  const router = mount("/?q=original");
  await screen.findByText("Original");
  await act(async () => { await router.navigate("/?q=slow"); });
  expect(screen.getByText(/Loading products/)).toBeVisible();
  expect(screen.queryByText("Original")).not.toBeInTheDocument();
  await act(async () => { await router.navigate("/?q=latest"); });
  await screen.findByText("Latest");
  await act(async () => { finish(reply("Obsolete")); });
  expect(screen.queryByText("Obsolete")).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue("latest");
  expect(router.state.location.search).toBe("?q=latest");
});

test("search pagination keeps cards while loading and hides them on failure; Retry recovers empty results", async () => {
  let fail!: (error: Error) => void;
  const fetch = vi.fn()
    .mockResolvedValueOnce(reply("Search match"))
    .mockImplementationOnce(() => new Promise<Response>((_, reject) => { fail = reject; }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ products: [], total: 0, skip: 12, limit: 12 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ products: [], total: 0, skip: 0, limit: 12 })));
  stubProducts("fetch", fetch);
  const router = mount("/?q=rare&sortBy=price&order=asc");
  await screen.findByText("Search match");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Search match")).toBeVisible();
  expect(screen.getByText(/Loading products/)).toBeVisible();
  await act(async () => { fail(new Error("Unavailable")); });
  await screen.findByRole("alert");
  expect(screen.queryByText("Search match")).not.toBeInTheDocument();
  expect(router.state.location.search).toBe("?q=rare&sortBy=price&order=asc&page=2");
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("No products found.");
  await waitFor(() => expect(router.state.location.search).toContain("page=1"));
  expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products/search?limit=12&skip=0&sortBy=price&order=asc&q=rare");
});


test("automatic page correction preserves pending search text until it is applied", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
    .mockImplementation(() => Promise.resolve(reply("Corrected")));
  stubProducts("fetch", fetch);
  const router = mount("/?q=old&page=99");
  vi.useFakeTimers();
  try {
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "new" } });
    await act(async () => { finish(reply("Old response")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(router.state.location.search).toBe("?q=old&page=3");
    expect(screen.getByRole("searchbox")).toHaveValue("new");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(router.state.location.search).toBe("?q=new&page=1");
    expect(String(fetch.mock.lastCall?.[0])).toContain("skip=0&sortBy=title&order=asc&q=new");
  } finally { vi.useRealTimers(); }
});

test("category selection cancels pending search, resets the page and pushes history", async () => {
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(
    url.endsWith("category-list") ? new Response(JSON.stringify(["beauty", "home"])) : reply(),
  ));
  vi.stubGlobal("fetch", fetch);
  const router = mount("/?q=lamp&page=2&sortBy=price&order=desc");
  await screen.findByRole("option", { name: "beauty" });
  vi.useFakeTimers();
  try {
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "discard" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "beauty" } });
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(router.state.historyAction).toBe("PUSH");
    expect(router.state.location.search).toBe("?page=1&sortBy=price&order=desc&category=beauty");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products/category/beauty?limit=12&skip=0&sortBy=price&order=desc");
    await act(async () => { await router.navigate(-1); });
    expect(screen.getByRole("searchbox")).toHaveValue("lamp");
    await act(async () => { await router.navigate(1); });
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("beauty");
  } finally { vi.useRealTimers(); }
});

function stubProducts(_name: string, fetch: typeof globalThis.fetch) {
  vi.stubGlobal("fetch", (url: string, options?: RequestInit) =>
    url.endsWith("category-list")
      ? Promise.resolve(new Response(JSON.stringify(["beauty", "home"])))
      : fetch(url, options),
  );
}

test("category URL paginates and sorts through the API, and All categories restores the list", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply()));
  stubProducts("fetch", fetch);
  const router = mount("/?category=beauty&page=2&sortBy=rating&order=desc");
  await screen.findByText("Page 2 of 3");
  const category = screen.getByRole("combobox", { name: "Category" });
  expect(category).toHaveValue("beauty");
  expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products/category/beauty?limit=12&skip=12&sortBy=rating&order=desc");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Page 3 of 3");
  expect(String(fetch.mock.lastCall?.[0])).toContain("category/beauty?limit=12&skip=24");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort products" }), "price-asc");
  await screen.findByText("Page 1 of 3");
  expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products/category/beauty?limit=12&skip=0&sortBy=price&order=asc");
  await userEvent.selectOptions(category, "");
  await waitFor(() => expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products?limit=12&skip=0&sortBy=price&order=asc"));
  expect(router.state.historyAction).toBe("PUSH");
  expect(new URLSearchParams(router.state.location.search).has("category")).toBe(false);
  await act(async () => { await router.navigate(-1); });
  expect(category).toHaveValue("beauty");
});

test.each([false, true])("pending search leaves category atomically, sorting=%s", async (sort) => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply()));
  stubProducts("fetch", fetch);
  const router = mount("/?category=beauty&page=2");
  await screen.findByText("Lamp");
  vi.useFakeTimers();
  try {
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "lamp" } });
    if (sort) fireEvent.change(screen.getByRole("combobox", { name: "Sort products" }), { target: { value: "price-desc" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("q")).toBe("lamp");
    expect(params.get("page")).toBe("1");
    expect(params.has("category")).toBe(false);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("");
    expect(router.state.historyAction).toBe(sort ? "PUSH" : "REPLACE");
    expect(String(fetch.mock.lastCall?.[0])).toBe(`https://dummyjson.com/products/search?limit=12&skip=0&sortBy=${sort ? "price" : "title"}&order=${sort ? "desc" : "asc"}&q=lamp`);
    expect(fetch.mock.calls.some(([url]) => String(url).includes("category/beauty") && String(url).includes("sortBy=price"))).toBe(false);
  } finally { vi.useRealTimers(); }
});

test("search wins over a conflicting URL category without requesting category products", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply()));
  stubProducts("fetch", fetch);
  const router = mount("/?q=lamp&category=beauty&page=2");
  await screen.findByText("Lamp");
  expect(router.state.location.search).toBe("?q=lamp&page=2");
  expect(router.state.historyAction).toBe("REPLACE");
  expect(fetch.mock.calls.every(([url]) => String(url).includes("products/search?"))).toBe(true);
});

test("only successful category loading invalidates an unknown URL category", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn().mockImplementation((url: string) => url.endsWith("category-list")
    ? new Promise<Response>((resolve) => { finish = resolve; }) : Promise.resolve(reply()));
  vi.stubGlobal("fetch", fetch);
  const router = mount("/?category=unknown&page=2");
  await screen.findByText("Lamp");
  expect(router.state.location.search).toBe("?category=unknown&page=2");
  expect(fetch.mock.calls.some(([url]) => String(url).includes("category/unknown?"))).toBe(true);
  await act(async () => { finish(new Response(JSON.stringify(["beauty"]))); });
  await waitFor(() => expect(router.state.location.search).toBe("?page=2"));
  expect(router.state.historyAction).toBe("REPLACE");
  expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("");
  await waitFor(() => expect(String(fetch.mock.lastCall?.[0])).toBe("https://dummyjson.com/products?limit=12&skip=12&sortBy=title&order=asc"));
});

test("category failure preserves URL browsing, search and sorting remain usable, and Retry recovers", async () => {
  let recovered = false;
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith("category-list")
    ? recovered ? new Response(JSON.stringify(["beauty"])) : new Response("", { status: 500 })
    : reply()));
  vi.stubGlobal("fetch", fetch);
  const router = mount("/?category=beauty&page=2");
  await screen.findByText("Categories unavailable");
  await screen.findByText("Lamp");
  const category = screen.getByRole("combobox", { name: "Category" });
  expect(category).toBeDisabled();
  expect(category).toHaveValue("beauty");
  expect(router.state.location.search).toBe("?category=beauty&page=2");
  expect(fetch.mock.calls.some(([url]) => String(url).includes("category/beauty?limit=12&skip=12"))).toBe(true);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort products" }), "price-desc");
  await screen.findByText("Page 1 of 3");
  expect(String(fetch.mock.lastCall?.[0])).toContain("category/beauty?limit=12&skip=0&sortBy=price&order=desc");
  await userEvent.type(screen.getByRole("searchbox"), "phone");
  await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("q")).toBe("phone"));
  await waitFor(() => expect(String(fetch.mock.lastCall?.[0])).toContain("products/search?limit=12&skip=0&sortBy=price&order=desc&q=phone"));
  recovered = true;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(category).toBeEnabled());
  expect(screen.queryByText("Categories unavailable")).not.toBeInTheDocument();
  await userEvent.selectOptions(category, "beauty");
  expect(screen.getByRole("searchbox")).toHaveValue("");
  await waitFor(() => expect(String(fetch.mock.lastCall?.[0])).toContain("category/beauty?limit=12&skip=0&sortBy=price&order=desc"));
});

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router";
import { getProducts } from "./products";
import { readProductView, sorts } from "./product-view";
import { Button } from "./components/ui/button";

const subscribeOnline = (update: () => void) => {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
};
export function ProductBrowser() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { page, sortBy, order, corrected } = readProductView(params);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollTarget = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["products", { page, sortBy, order }],
    queryFn: ({ signal }) => getProducts(page, sortBy, order, signal),
    retry: false,
    placeholderData: (previous, previousQuery) => {
      const previousView = previousQuery?.queryKey[1] as
        { sortBy: string; order: string } | undefined;
      return previousView?.sortBy === sortBy && previousView.order === order
        ? previous
        : undefined;
    },
  });
  const loading =
    query.isPending ||
    query.isFetching ||
    query.fetchStatus === "paused" ||
    query.isPlaceholderData;
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 12));
  const correction = corrected.toString();
  useEffect(() => {
    if (correction !== params.toString())
      setParams(correction, { replace: true });
  }, [correction, params, setParams]);
  useEffect(() => {
    if (query.isSuccess && !query.isPlaceholderData && page > pages) {
      const next = new URLSearchParams(params);
      next.set("page", String(pages));
      setParams(next, { replace: true });
    }
  }, [
    query.isSuccess,
    query.isPlaceholderData,
    page,
    pages,
    params,
    setParams,
  ]);
  useEffect(() => {
    if (scrollTarget.current !== location.search) scrollTarget.current = null;
    if (scrollTarget.current && query.isSuccess && !loading && page <= pages) {
      heading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      scrollTarget.current = null;
    }
  }, [location.search, query.isSuccess, loading, page, pages]);
  function changePage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    scrollTarget.current = `?${next}`;
    setParams(next);
  }
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
          The catalog
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Product Browser
        </h1>
        <p className="mt-3 text-slate-600">
          A little discovery, one page at a time.
        </p>
      </header>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <h2 ref={heading} className="scroll-mt-6 text-2xl font-semibold">
          Products
        </h2>
        <label className="flex max-w-full flex-col gap-2 text-sm font-medium">
          Sort products
          <select
            className="max-w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            value={`${sortBy}-${order}`}
            onChange={(event) => {
              const [field, direction] = event.target.value.split("-");
              const next = new URLSearchParams(params);
              next.set("sortBy", field);
              next.set("order", direction);
              next.set("page", "1");
              scrollTarget.current = null;
              setParams(next);
            }}
          >
            {sorts.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!online && (
        <p role="status" className="notice">
          You appear to be offline.
        </p>
      )}
      {loading ? (
        <p role="status" className="mb-5 text-slate-600">
          Loading products...
        </p>
      ) : null}
      {query.isError ? (
        <div role="alert" className="notice">
          <p>Unable to load products. Please try again.</p>
          <Button onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : (
        <>
          {query.data?.total === 0 && (
            <p role="status" className="notice">
              No products found.
            </p>
          )}
          <div
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy={loading}
          >
            {query.data?.products.map((product) => (
              <article
                key={product.id}
                className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="bg-slate-100 p-5">
                  <img
                    className="h-48 w-full object-contain"
                    src={product.thumbnail}
                    alt={product.title}
                    loading="lazy"
                  />
                </div>
                <div className="p-5">
                  <p className="text-sm text-teal-700">{product.category}</p>
                  <h3 className="mt-2 break-words text-lg font-semibold">
                    {product.title}
                  </h3>
                  <p className="mt-4 text-xl font-semibold">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(product.price)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Rating: {product.rating} / 5
                  </p>
                </div>
              </article>
            ))}
          </div>
          {!!query.data?.total && (
            <nav
              aria-label="Results pages"
              className="mt-8 flex flex-wrap items-center justify-center gap-4"
            >
              <Button
                disabled={page <= 1 || loading}
                onClick={() => changePage(page - 1)}
              >
                Previous
              </Button>
              <p aria-live="polite">
                Page {page} of {pages}
              </p>
              <Button
                disabled={page >= pages || loading}
                onClick={() => changePage(page + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </main>
  );
}

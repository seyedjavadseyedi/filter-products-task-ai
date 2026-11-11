# Product Browser

A small React learning app for browsing DummyJSON products with sorting and pagination (issue #2).

## Run

Requires Node 22.12+ (verified with Node 24).

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npx playwright test
```

Browser tests use installed Google Chrome. For deployment, serve `dist/` with an SPA fallback to `index.html`.

## Choices

- The URL owns `page` (one-based), `sortBy` (`title`, `price`, `rating`) and `order` (`asc`, `desc`). Omitted values default to page 1, title ascending. Invalid values and out-of-range pages use history replace; user actions push history.
- `product-view.ts` parses URL values; `products.ts` is the typed HTTP boundary. The screen composes them directly with TanStack Query. Products retain API order.
- Every request value belongs to the query key. Fetch consumes Query's abort signal. Previous data is retained only when sorting stays the same; errors hide stale cards. Retry uses the current view.
- Tailwind provides the responsive layout; a local shadcn/ui Button adapted from the official new-york registry provides pagination and Retry controls. A native labelled select keeps six sorting choices easy to use.
- Screen tests use real router/query providers and mock only HTTP fetch. Browser tests verify deep links, refresh, history, layout and scrolling.

## Official setup references

Setup checked against [React TypeScript](https://react.dev/learn/typescript), [Vite](https://vite.dev/guide/), [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite), [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite), [shadcn manual installation](https://ui.shadcn.com/docs/installation/manual), [React Router declarative installation](https://reactrouter.com/start/declarative/installation), [TanStack Query pagination](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries), and [DummyJSON products](https://dummyjson.com/docs/products).

Search and category selection belong to later issue slices.

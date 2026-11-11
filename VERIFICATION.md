# Ticket #2 verification

Verified on 2026-11-11 against issue #2, Browse products with sorting and pagination.
The behavior was already implemented in 4094ec7 and 022193b. Completion review
consolidated the fixed results-page size across requests and the page indicator.

## Checks

- `npm test`: 19 complete-screen tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npx playwright test`: 2 Chrome browser tests passed.

Screen tests use real router/query providers with mocked HTTP responses. They
cover card information and API order, six sort choices, pagination, URL correction,
empty/loading/error/Retry/offline states, superseded responses, history, and
paused pagination recovery.

Browser tests verify shared URLs, refresh, Back/Forward, 375 x 700 single-column
layout without horizontal overflow, 1280 x 800 responsive columns, and scrolling
to the results heading after pagination. These are automated layout checks, not
a manual visual or accessibility audit.

## Review

Two independent review agents inspected `git diff 563df56...HEAD` against the
ticket and repository standards. Spec: no findings. Standards: no documented
violations; one nonblocking duplicated page-size rule, resolved with
`RESULTS_PAGE_SIZE`. Existing behavior tests retain literal expected API values.

The Vite, Tailwind Vite integration, shadcn/ui Vite setup, and TanStack Query
pagination documentation linked in README were checked during completion.

Live DummyJSON and manual usability verification remain in ticket #6. Search,
categories, and their browser navigation scenarios remain in tickets #3–#5.


# Ticket #3 verification

Verified on 2026-11-11 against Search products with debounced URL updates.

- `npm test`: 25 complete-screen tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npx playwright test`: 3 Chrome tests passed.

Search tests exercise the 300ms debounce, URL replacement, API request contract,
API-provided matches, clearing, sort preservation, pagination, atomic sorting
with pending text, Back/Forward cancellation, stale responses, loading, errors,
Retry, and empty results. Browser coverage adds search deep links, refresh, and
history restoration. HTTP fixtures return predetermined responses and do not
implement the backend search algorithm.

Independent reviews compared the changes against starting commit `29faed1`.
Standards: no documented violations; two optional suggestions (small duplicated
URL update logic and grouping product-view request arguments). Kept the current
small implementation. Spec: one bug found and fixed with a regression test:
automatic page correction must preserve pending search input. Back/Forward still
restore input from the URL and cancel pending edits.

Live DummyJSON verification remains in ticket #6; these checks use mocked HTTP.

# Ticket #4 verification

Verified on 2026-11-11 against Browse categories and coordinate them with search.

- `npm test`: 32 complete-screen tests passed.
- `npm run typecheck`: passed, including after review cleanup.
- `npm run build`: passed.
- `npx playwright test`: 4 Chrome tests passed.
- `git diff --check`: passed.

Screen coverage adds API category routes and pagination/sorting parameters,
category selection clearing pending/applied search, cancellation of debounce,
All categories, history, atomic search/sort transitions, conflicting search/category
URLs, successful unknown-category correction, and independent category-list
failure/retry while preserving category URLs and usable search/sorting.
Product requests wait for canonical URL corrections before fetching.

Browser coverage adds category deep links, refresh, Back/Forward, pagination,
keyboard focus, and control bounds at 375px without horizontal overflow.
These are automated browser layout checks. Live API and manual usability
verification remain in ticket #6.

## Standards

Independent review against starting commit `f1974d5`: no documented violations.
Two optional heuristics: repeated search/category URL-update logic and an unused
test-helper argument. Removed the unused argument and reran all 32 screen tests;
kept the small explicit URL transitions in their callers.

## Spec

Independent review against issue #4 and the product specification: no findings.

Review totals: Standards 0 hard violations, 1 remaining optional duplication
suggestion; Spec 0 findings.

# Ticket #5 verification

Verified on 2026-11-11 against **Verify shared URLs and browser navigation**.

Reproduce from the repository root with dependencies and Google Chrome installed:

- `npx playwright test e2e/navigation.spec.ts`: 6 focused navigation tests passed.
- `npx playwright test`: all 10 browser tests passed; Playwright starts Vite automatically.
- `npm test -- src/ProductBrowser.test.tsx`: 32 screen tests passed.
- `npm test`: full suite, 32 screen tests passed.
- `npm run typecheck`: passed, now including browser tests and Playwright configuration.
- `npm run build`: passed.
- `git diff --check`: passed.

The new browser suite intercepts every DummyJSON request. Shared search and
category links assert visible controls, cards, pagination controls, the URL,
and exact request route/parameters before and after refresh. History scenarios
cover category, sorting and pagination, two applied search phrases replacing one
entry, and pending search cancellation on both Back and Forward. A paused browser
clock advances 1000ms after navigation to ensure discarded text cannot issue a
request or overwrite the URL, input or cards. Normalization scenarios cover
search/category conflicts, invalid page/sort values, an unknown category and an
out-of-range page, then navigate Back/Forward across the corrected entry.

Existing production behavior passed these scenarios; no production fix was
needed. Initial test-clock failures were corrected in the tests. Live DummyJSON
and manual usability verification remain in ticket #6.

Independent code review compares against starting commit `8aecdb9`.
Standards: no documented violations; one optional suggestion to replace the
small view-assertion helper's positional arguments with a named object.
Spec: no actionable findings. Review totals: Standards 0 hard violations and
1 optional readability suggestion; Spec 0 findings. The executed commands and
results above complete the implementation handoff.

# Ticket #6 verification

Verified on 2026-11-11 against **Verify mobile usability and real API behavior**.
No production behavior changes were necessary. Added four browser scenarios,
an optional live-service verification script, and a stricter pagination scroll
assertion that requires the heading to be inside the viewport, not above it.

## Visual and keyboard inspection

The interactive browser host was unavailable. Used installed Chrome through
Playwright, manually inspected its captured screenshots, and drove controls with
real keyboard events. This is desktop browser viewport testing, not physical
phone or screen-reader testing.

- At **375 x 700**, inspected a single product column, fitting labelled controls,
  visible focus, readable cards, and wrapped long unbroken product titles without
  horizontal scrolling. At **1280 x 800**, inspected the three-column grid.
- Inspected loading, product error/Retry, empty, category-list failure, and offline
  feedback. The category error can move sorting to another row; controls still fit.
- Keyboard checks cover search typing, Tab order through Category and Sort,
  category and sort selection with arrow/End keys, Next with Enter, and Retry
  with Enter. Previous/Next boundary and unavailable-category disabled states pass.
- Images use product titles as alternatives. Status/alert roles expose loading,
  empty, offline, category failure, and product errors to the accessibility tree.
- After live keyboard pagination and successful loading, the results heading is
  between 0 and 100px from the viewport top. Refresh retains page 2.

Saved live captures: [mobile](docs/verification/issue-6/mobile.png),
[visible keyboard focus](docs/verification/issue-6/keyboard-focus.png),
[page 2 after scrolling](docs/verification/issue-6/mobile-page-2.png), and
[desktop](docs/verification/issue-6/desktop.png).
Controlled-state screenshots are generated by `e2e/usability.spec.ts` under
`test-results/`; subsequent Playwright runs replace that directory.

## Real DummyJSON

Ran `node scripts/verify-live.mjs` with Vite serving `http://127.0.0.1:5173`.
No API responses were intercepted in this run. [Recorded response IDs and totals](docs/verification/issue-6/evidence.json)
cover **36 views**: list, search, and category, each with all six sort choices on
pages 1 and 2 (`limit=12`, `skip=0/12`). Compared the returned page IDs and totals
with the same service's full sorted response, then compared card order, titles,
categories, formatted prices, ratings, image alternatives, controls, and page counts
with those actual responses. Numeric ordering is checked directly; title collation
and returned order remain owned by DummyJSON.

| Route | Selection | Observed total | Results pages |
| --- | --- | ---: | ---: |
| `/products` | All products | 194 | 17 |
| `/products/search` | `q=phone` | 23 | 2 |
| `/products/category/smartphones` | Smartphones | 16 | 2 |

The case-insensitive `HEADPHONES` search returned **Apple AirPods Max Silver**
(ID 101): its description contains headphones while its title does not. A nonsense
query showed the real empty state. Selecting smartphones cleared search; typing
phone cleared category. Additional live requests confirmed that the beauty route
ignores `q=phone` and search ignores `category=beauty` (responses match requests
without those unsupported parameters). The documented mutual exclusion remains;
there is no client-side intersection or sorting.

## Automated checks

- `npx playwright test e2e/usability.spec.ts`: **4 passed**.
- `npx playwright test`: **14 passed** (full critical browser suite).
- `npm test -- src/ProductBrowser.test.tsx`: **32 passed**.
- `npm test`: **32 passed** (full screen suite).
- `npm run typecheck`: passed.
- `npm run build`: passed.

`git diff --check` also passed.

Shared URLs, Refresh, Back/Forward, pending-edit cancellation, URL normalization,
and category/search coordination are exercised by the critical browser suite.
Controlled browser checks simulate product HTTP 503 and keyboard Retry, an
independent category-list HTTP 503 and recovery with the URL preserved, browser
offline/online events, and empty results. Screen tests also cover stale cards,
pagination loading, superseded responses, and current-view Retry.

## Limits

Live totals and records are observations, not permanent catalog expectations.
The live script is optional because it depends on external availability. Initial
verification-harness issues (assuming local title collation and native select
Enter behavior) were corrected; no app change was indicated. Visual inspection
is based on screenshots and keyboard automation; no physical-device or
screen-reader audit was performed.

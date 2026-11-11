export const sorts = [
  ["title-asc", "Title A–Z"],
  ["title-desc", "Title Z–A"],
  ["price-asc", "Price low to high"],
  ["price-desc", "Price high to low"],
  ["rating-asc", "Rating low to high"],
  ["rating-desc", "Rating high to low"],
] as const;
export function readProductView(params: URLSearchParams, categories?: string[]) {
  const raw = params.get("page");
  const page =
    raw && /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw))
      ? Number(raw)
      : 1;
  const sort = `${params.get("sortBy") ?? "title"}-${params.get("order") ?? "asc"}`;
  const valid = sorts.some(([value]) => value === sort);
  const [sortBy, order] = (valid ? sort : "title-asc").split("-");
  const corrected = new URLSearchParams(params);
  if (raw !== null && raw !== String(page)) corrected.set("page", String(page));
  if (!valid) {
    corrected.set("sortBy", "title");
    corrected.set("order", "asc");
  }
  const search = params.get("q") ?? "";
  const rawCategory = params.get("category") ?? "";
  const category = !search && (!categories || categories.includes(rawCategory)) ? rawCategory : "";
  if (rawCategory && !category) corrected.delete("category");
  return { page, sortBy, order, search, category, corrected };
}

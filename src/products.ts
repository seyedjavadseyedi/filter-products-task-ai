export const RESULTS_PAGE_SIZE = 12;

export type Product = {
  id: number;
  title: string;
  category: string;
  price: number;
  rating: number;
  thumbnail: string;
};
export type ProductPage = {
  products: Product[];
  total: number;
  skip: number;
  limit: number;
};
export async function getProducts(
  page: number,
  sortBy: string,
  order: string,
  signal: AbortSignal,
  search: string,
  category: string,
): Promise<ProductPage> {
  const params = new URLSearchParams({
    limit: String(RESULTS_PAGE_SIZE),
    skip: String((page - 1) * RESULTS_PAGE_SIZE),
    sortBy,
    order,
  });
  if (search) params.set("q", search);
  const path = search ? "products/search" : category
    ? `products/category/${encodeURIComponent(category)}` : "products";
  const response = await fetch(`https://dummyjson.com/${path}?${params}`, {
    signal,
  });
  if (!response.ok) throw new Error("Products unavailable");
  return response.json();
}

export async function getCategories(signal: AbortSignal): Promise<string[]> {
  const response = await fetch("https://dummyjson.com/products/category-list", { signal });
  if (!response.ok) throw new Error("Categories unavailable");
  return response.json();
}

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
): Promise<ProductPage> {
  const params = new URLSearchParams({
    limit: String(RESULTS_PAGE_SIZE),
    skip: String((page - 1) * RESULTS_PAGE_SIZE),
    sortBy,
    order,
  });
  const response = await fetch(`https://dummyjson.com/products?${params}`, {
    signal,
  });
  if (!response.ok) throw new Error("Products unavailable");
  return response.json();
}

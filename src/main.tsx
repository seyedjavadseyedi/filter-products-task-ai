import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductBrowser } from "./ProductBrowser";
import "./index.css";
const client = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <QueryClientProvider client={client}>
      <ProductBrowser />
    </QueryClientProvider>
  </BrowserRouter>,
);

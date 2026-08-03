import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";

export type PaperOrderV2 = {
  id: string;
  side: "buy" | "sell";
  mint: string;
  source: string;
  createdAt: string;
};

export type PaperFillV2 = {
  id: string;
  orderIntentId: string;
  side: "buy" | "sell";
  mint: string;
  priceSol: number;
  sizeSol: number;
  fillStatus: "filled" | "rejected" | "partial";
  createdAt: string;
  paperOnly: true;
};

export function usePortfolioHistory(enabled = true) {
  const orders = useQuery({
    queryKey: ["portfolio", "orders"],
    queryFn: ({ signal }) =>
      apiClient.get<{ orders: PaperOrderV2[] }>("/paper-portfolio/orders?limit=100", { signal }),
    enabled,
    staleTime: 5_000
  });
  const fills = useQuery({
    queryKey: ["portfolio", "fills"],
    queryFn: ({ signal }) =>
      apiClient.get<{ fills: PaperFillV2[] }>("/paper-portfolio/fills?limit=100", { signal }),
    enabled,
    staleTime: 5_000
  });
  return { orders, fills };
}

import type { GatewayBrowserClient } from "../gateway.ts";

export type MarketplaceSeller = {
  nodeId: string;
  status: string;
  activeRequests: number;
  maxConcurrent: number;
  performanceScore: number;
  totalCompleted: number;
  totalFailed: number;
};

export type MarketplaceStatusResult = {
  enabled: boolean;
  availableSellers: number;
  totalSellers: number;
  priceFraction?: number;
  platformFeePct?: number;
  sellers: MarketplaceSeller[];
};

export type MarketplaceState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  marketplaceLoading: boolean;
  marketplaceStatus: MarketplaceStatusResult | null;
  marketplaceError: string | null;
};

export async function loadMarketplace(state: MarketplaceState) {
  if (!state.client || !state.connected || state.marketplaceLoading) {
    return;
  }
  state.marketplaceLoading = true;
  state.marketplaceError = null;
  try {
    const res = await state.client.request<MarketplaceStatusResult>("marketplace.status", {});
    state.marketplaceStatus = res;
  } catch (err) {
    state.marketplaceError = String(err);
  } finally {
    state.marketplaceLoading = false;
  }
}

import type { MarketplaceScheduler } from "../marketplace/scheduler.js";
/**
 * Marketplace WebSocket method handlers for the Control UI.
 *
 * Methods:
 *   marketplace.status           — list available sellers, capacity, pricing info
 *   marketplace.opt-in           — toggle marketplace sharing on this node
 *   marketplace.opt-out          — disable marketplace sharing
 *   marketplace.earnings         — seller earnings breakdown
 *   marketplace.config           — get/set marketplace preferences
 *   marketplace.process-payouts  — trigger payout processing for accumulated earnings
 *   marketplace.transactions     — list recent marketplace transactions
 */
import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { getTransactionLog } from "../marketplace-http.js";
import { processPayouts, type PayoutRequest } from "../marketplace/payouts.js";

let schedulerRef: MarketplaceScheduler | null = null;

/** Set the scheduler reference so handlers can access it. */
export function setMarketplaceScheduler(scheduler: MarketplaceScheduler): void {
  schedulerRef = scheduler;
}

export const marketplaceHandlers: GatewayRequestHandlers = {
  "marketplace.status": async ({ respond }) => {
    const config = loadConfig();
    const marketplaceConfig = config.gateway?.marketplace;
    const enabled = marketplaceConfig?.enabled === true;

    if (!enabled || !schedulerRef) {
      respond(true, {
        enabled: false,
        availableSellers: 0,
        totalSellers: 0,
        sellers: [],
      });
      return;
    }

    const sellers = schedulerRef.listSellers();
    const available = schedulerRef.availableCount();

    respond(true, {
      enabled: true,
      availableSellers: available,
      totalSellers: sellers.length,
      priceFraction: marketplaceConfig?.priceFraction ?? 0.6,
      platformFeePct: marketplaceConfig?.platformFeePct ?? 20,
      sellers: sellers.map((s) => ({
        nodeId: s.nodeId,
        status: s.status,
        activeRequests: s.activeRequests,
        maxConcurrent: s.maxConcurrent,
        performanceScore: s.performanceScore,
        totalCompleted: s.totalCompleted,
        totalFailed: s.totalFailed,
      })),
    });
  },

  "marketplace.opt-in": async ({ respond, client, context }) => {
    const nodeId = client?.connect?.device?.id ?? client?.connect?.client?.id;
    if (!nodeId) {
      respond(false, undefined, { code: "NO_NODE", message: "no node identity" });
      return;
    }

    const session = context.nodeRegistry.get(nodeId);
    if (!session) {
      respond(false, undefined, { code: "NOT_CONNECTED", message: "node not connected" });
      return;
    }

    session.marketplaceEnabled = true;
    session.marketplaceStatus = "idle";
    session.marketplaceActiveRequests = session.marketplaceActiveRequests ?? 0;
    session.marketplaceMaxConcurrent = session.marketplaceMaxConcurrent ?? 1;

    if (schedulerRef) {
      schedulerRef.syncFromNodeSession(session);
    }

    respond(true, { nodeId, marketplaceEnabled: true, status: "idle" });
  },

  "marketplace.opt-out": async ({ respond, client, context }) => {
    const nodeId = client?.connect?.device?.id ?? client?.connect?.client?.id;
    if (!nodeId) {
      respond(false, undefined, { code: "NO_NODE", message: "no node identity" });
      return;
    }

    const session = context.nodeRegistry.get(nodeId);
    if (!session) {
      respond(false, undefined, { code: "NOT_CONNECTED", message: "node not connected" });
      return;
    }

    session.marketplaceEnabled = false;
    session.marketplaceStatus = "active";

    if (schedulerRef) {
      schedulerRef.removeSeller(nodeId);
    }

    respond(true, { nodeId, marketplaceEnabled: false });
  },

  "marketplace.earnings": async ({ respond, client }) => {
    const nodeId = client?.connect?.device?.id ?? client?.connect?.client?.id;
    if (!nodeId) {
      respond(false, undefined, { code: "NO_NODE", message: "no node identity" });
      return;
    }

    if (!schedulerRef) {
      respond(true, {
        nodeId,
        totalCompleted: 0,
        totalFailed: 0,
        performanceScore: 0,
        estimatedEarningsCents: 0,
      });
      return;
    }

    const sellers = schedulerRef.listSellers();
    const seller = sellers.find((s) => s.nodeId === nodeId);

    respond(true, {
      nodeId,
      totalCompleted: seller?.totalCompleted ?? 0,
      totalFailed: seller?.totalFailed ?? 0,
      performanceScore: seller?.performanceScore ?? 0,
      status: seller?.status ?? "inactive",
    });
  },

  "marketplace.config": async ({ params, respond, client, context }) => {
    const nodeId = client?.connect?.device?.id ?? client?.connect?.client?.id;
    if (!nodeId) {
      respond(false, undefined, { code: "NO_NODE", message: "no node identity" });
      return;
    }

    const session = context.nodeRegistry.get(nodeId);
    if (!session) {
      respond(false, undefined, { code: "NOT_CONNECTED", message: "node not connected" });
      return;
    }

    // If params include updates, apply them.
    if (typeof params.maxConcurrent === "number" && params.maxConcurrent > 0) {
      session.marketplaceMaxConcurrent = params.maxConcurrent;
    }
    if (
      typeof params.payoutPreference === "string" &&
      (params.payoutPreference === "usd" || params.payoutPreference === "ai_token")
    ) {
      session.marketplacePayoutPreference = params.payoutPreference;
    }

    respond(true, {
      nodeId,
      marketplaceEnabled: session.marketplaceEnabled ?? false,
      status: session.marketplaceStatus ?? "active",
      maxConcurrent: session.marketplaceMaxConcurrent ?? 1,
      payoutPreference: session.marketplacePayoutPreference ?? "usd",
    });
  },

  "marketplace.transactions": async ({ params, respond }) => {
    const txLog = getTransactionLog();
    const limit = typeof params.limit === "number" ? Math.min(params.limit, 1000) : 100;
    const recent = txLog.slice(-limit);

    respond(true, {
      count: txLog.length,
      transactions: recent.map((tx) => ({
        requestId: tx.requestId,
        buyerUserId: tx.buyerUserId,
        sellerNodeId: tx.sellerNodeId,
        model: tx.model,
        buyerCostCents: tx.buyerCostCents,
        sellerEarningsCents: tx.sellerEarningsCents,
        platformFeeCents: tx.platformFeeCents,
        aiTokenPayout: tx.aiTokenPayout,
        timestamp: tx.timestamp,
        durationMs: tx.durationMs,
      })),
    });
  },

  "marketplace.process-payouts": async ({ respond }) => {
    const config = loadConfig();
    const marketplaceConfig = config.gateway?.marketplace;
    if (!marketplaceConfig?.enabled) {
      respond(false, undefined, {
        code: "DISABLED",
        message: "marketplace not enabled",
      });
      return;
    }

    // Aggregate earnings from transaction log by seller.
    const txLog = getTransactionLog();
    const now = Date.now();
    const earningsBySeller = new Map<
      string,
      { amountCents: number; nodeId: string; preference: "usd" | "ai_token" }
    >();

    for (const tx of txLog) {
      const existing = earningsBySeller.get(tx.sellerNodeId);
      if (existing) {
        existing.amountCents += tx.sellerEarningsCents;
      } else {
        earningsBySeller.set(tx.sellerNodeId, {
          amountCents: tx.sellerEarningsCents,
          nodeId: tx.sellerNodeId,
          preference: tx.aiTokenPayout ? "ai_token" : "usd",
        });
      }
    }

    const requests: PayoutRequest[] = [];
    for (const [sellerId, earnings] of earningsBySeller) {
      requests.push({
        sellerUserId: sellerId,
        sellerNodeId: earnings.nodeId,
        amountCents: earnings.amountCents,
        preference: earnings.preference,
        periodStart: now - 7 * 24 * 60 * 60 * 1000,
        periodEnd: now,
      });
    }

    if (requests.length === 0) {
      respond(true, { processed: 0, results: [] });
      return;
    }

    const results = await processPayouts(requests, marketplaceConfig);
    respond(true, {
      processed: results.length,
      results: results.map((r) => ({
        sellerUserId: r.sellerUserId,
        amountCents: r.amountCents,
        bonusCents: r.bonusCents,
        totalCents: r.totalCents,
        preference: r.preference,
        status: r.status,
        error: r.error,
        transactionId: r.transactionId,
        txHash: r.txHash,
      })),
    });
  },
};

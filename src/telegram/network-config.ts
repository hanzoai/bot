import process from "node:process";
import type { TelegramNetworkConfig } from "../config/types.telegram.js";
import { isTruthyEnvValue } from "../infra/env.js";

export const TELEGRAM_DISABLE_AUTO_SELECT_FAMILY_ENV = "BOT_TELEGRAM_DISABLE_AUTO_SELECT_FAMILY";
export const TELEGRAM_ENABLE_AUTO_SELECT_FAMILY_ENV = "BOT_TELEGRAM_ENABLE_AUTO_SELECT_FAMILY";
export const TELEGRAM_DNS_RESULT_ORDER_ENV = "BOT_TELEGRAM_DNS_RESULT_ORDER";

export type TelegramAutoSelectFamilyDecision = {
  value: boolean | null;
  source?: string;
};

export type TelegramDnsResultOrderDecision = {
  value: string | null;
  source?: string;
};

export function resolveTelegramAutoSelectFamilyDecision(params?: {
  network?: TelegramNetworkConfig;
  env?: NodeJS.ProcessEnv;
  nodeMajor?: number;
}): TelegramAutoSelectFamilyDecision {
  const env = params?.env ?? process.env;
  const nodeMajor =
    typeof params?.nodeMajor === "number"
      ? params.nodeMajor
      : Number(process.versions.node.split(".")[0]);

  if (isTruthyEnvValue(env[TELEGRAM_ENABLE_AUTO_SELECT_FAMILY_ENV])) {
    return { value: true, source: `env:${TELEGRAM_ENABLE_AUTO_SELECT_FAMILY_ENV}` };
  }
  if (isTruthyEnvValue(env[TELEGRAM_DISABLE_AUTO_SELECT_FAMILY_ENV])) {
    return { value: false, source: `env:${TELEGRAM_DISABLE_AUTO_SELECT_FAMILY_ENV}` };
  }
  if (typeof params?.network?.autoSelectFamily === "boolean") {
    return { value: params.network.autoSelectFamily, source: "config" };
  }
  if (Number.isFinite(nodeMajor) && nodeMajor >= 22) {
    return { value: false, source: "default-node22" };
  }
  return { value: null };
}

export function resolveTelegramDnsResultOrderDecision(params?: {
  network?: TelegramNetworkConfig;
  env?: NodeJS.ProcessEnv;
}): TelegramDnsResultOrderDecision {
  const env = params?.env ?? process.env;

  const envValue = env[TELEGRAM_DNS_RESULT_ORDER_ENV]?.trim();
  if (envValue === "ipv4first" || envValue === "verbatim") {
    return { value: envValue, source: `env:${TELEGRAM_DNS_RESULT_ORDER_ENV}` };
  }
  if (typeof params?.network?.dnsResultOrder === "string") {
    return { value: params.network.dnsResultOrder, source: "config" };
  }
  return { value: null };
}

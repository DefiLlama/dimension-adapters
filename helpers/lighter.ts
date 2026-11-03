import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { sleep } from "../utils/utils";
import { CHAIN } from "./chains";

// Lighter partner (builder) attribution, the same endpoint that powers https://lighter.exchange/stats?tab=partners
// The partner list and account indexes on that page are hardcoded in its exchange-stats bundle.
// Lighter on Robinhood Chain (the venue tracked by dexs/lighter-rh) is a separate deployment with its own API and account indexes.
const PARTNER_STATS_URLS: Record<string, string> = {
  [CHAIN.ZK_LIGHTER]: "https://mainnet.zklighter.elliot.ai/api/v1/partnerStats",
  [CHAIN.ROBINHOOD]: "https://api.rh.lighter.xyz/api/v1/partnerStats",
};
export const LIGHTER_PARTNER_FEES_LABEL = "Lighter Partner Fees";

// A partner account index on one deployment. When a partner rotates accounts, list each with the days it was
// active (inclusive, YYYY-MM-DD); every account active on the window's day is queried and summed. Ranges may
// overlap safely, each account only reports its own trades.
export type LighterAccountConfig = string | { index: string; start?: string; end?: string };

function activeLighterAccounts(accounts: LighterAccountConfig[], dateString: string): string[] {
  const active = new Set<string>();
  for (const account of accounts) {
    if (typeof account === "string") active.add(account);
    else if ((!account.start || dateString >= account.start) && (!account.end || dateString <= account.end)) active.add(account.index);
  }
  return [...active];
}

// Volume and partner fees of trades routed through a partner's Lighter account(s) in [startTimestamp, endTimestamp).
// end_timestamp is inclusive on the API side (ms), so subtract 1ms to keep hourly windows from double counting the boundary.
export async function fetchLighterPartnerStats(options: FetchOptions, accounts: LighterAccountConfig | LighterAccountConfig[]) {
  const url = PARTNER_STATS_URLS[options.chain];
  if (!url) throw new Error(`no Lighter partnerStats endpoint for chain ${options.chain}`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  for (const accountIndex of activeLighterAccounts(Array.isArray(accounts) ? accounts : [accounts], options.dateString)) {
    const res = await fetchURL(`${url}?account_index=${accountIndex}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000 - 1}`);
    if (res?.code !== 200 || res.total_volume == null || res.total_fees_earned == null)
      throw new Error(`Lighter partnerStats failed for account ${accountIndex} on ${options.chain}: ${JSON.stringify(res)}`);
    dailyVolume.addUSDValue(Number(res.total_volume));
    dailyFees.addUSDValue(Number(res.total_fees_earned), LIGHTER_PARTNER_FEES_LABEL);
  }
  return { dailyVolume, dailyFees };
}

// partnerStats sums every market type: perps, spot and binary options (Up or Down prediction markets). The trade feed tags
// each trade with its market type, so a partner trading several of them can be listed per market type from it.
// https://docs.lighter.xyz/developers/binary-options/partner-attribution
export type LighterMarketType = "perp" | "spot" | "bo";
const TRADES_URLS: Record<string, string> = {
  [CHAIN.ZK_LIGHTER]: "https://mainnet.zklighter.elliot.ai/api/v1/trades",
};
const MARKET_NAMES: Record<LighterMarketType, string> = { perp: "perps", spot: "spot", bo: "Up or Down prediction market" };

// Volume and partner fees of one market type's trades routed through a partner's account(s) in [startTimestamp, endTimestamp).
// The feed only pages backwards from the newest trade, so this reads every trade newer than the window; it suits partners
// with a modest trade count. A side of a trade counts when its fee collector is the partner's account, zero-fee (Standard
// tier) sides included, the same way partnerStats sums taker and maker volume. Up or Down prediction markets (market type
// bo) also return the shares traded as notional volume, each share paying $1 at settlement.
export async function fetchLighterPartnerTrades(options: FetchOptions, accounts: LighterAccountConfig | LighterAccountConfig[], marketType: LighterMarketType) {
  const url = TRADES_URLS[options.chain];
  if (!url) throw new Error(`no Lighter trades endpoint for chain ${options.chain}`);

  const startMs = options.startTimestamp * 1000;
  const endMs = options.endTimestamp * 1000;
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  const dailyFees = options.createBalances();
  for (const accountIndex of activeLighterAccounts(Array.isArray(accounts) ? accounts : [accounts], options.dateString)) {
    let cursor: string | undefined;
    let volume = 0, notional = 0, fees = 0;
    do {
      const res = await fetchURL(`${url}?integrator_account_index=${accountIndex}&market_type=${marketType}&sort_by=timestamp&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      if (res?.code !== 200 || !Array.isArray(res.trades)) throw new Error(`Lighter trades failed for account ${accountIndex}: ${JSON.stringify(res)}`);
      for (const trade of res.trades) {
        if (trade.timestamp < startMs || trade.timestamp >= endMs) continue;
        for (const side of ["taker", "maker"]) {
          if (String(trade[`integrator_${side}_fee_collector_index`]) !== accountIndex) continue;
          const usd = Number(trade.usd_amount);
          volume += usd;
          // the stored rate is already scaled by the binary options price curve, see the docs above
          fees += usd * Number(trade[`integrator_${side}_fee`] || 0) / 1e6;
          if (marketType === "bo") notional += Number(trade.size);
        }
      }
      const oldest = res.trades[res.trades.length - 1];
      if (!oldest || oldest.timestamp < startMs) break;
      cursor = res.next_cursor;
      if (cursor) await sleep(300);
    } while (cursor);
    dailyVolume.addUSDValue(volume);
    dailyNotionalVolume.addUSDValue(notional);
    dailyFees.addUSDValue(fees, LIGHTER_PARTNER_FEES_LABEL);
  }
  return { dailyVolume, dailyNotionalVolume, dailyFees };
}

export interface LighterPartnerConfig {
  name: string;
  // one entry per Lighter deployment the partner is integrated with (zklighter, robinhood)
  chains: Record<string, { start: string; accounts: LighterAccountConfig[]; deadFrom?: string }>;
  // count only this market type, from the trade feed; omitted, partnerStats sums all market types
  marketType?: LighterMarketType;
  // the partner's own Fees and Revenue wording, as builderConfigs allow in factory/hyperliquid.ts
  methodology?: { Fees: string; Revenue: string };
}

// Adapter for a partner whose fees are all kept by the partner (no supply side).
export function exportLighterPartnerAdapter({ name, chains, marketType, methodology }: LighterPartnerConfig): SimpleAdapter {
  const market = marketType ? MARKET_NAMES[marketType] : "perps";
  const defaultText = `Partner fees earned by ${name} on Lighter ${market} trades routed through its integration.`;
  const feesText = methodology?.Fees ?? defaultText;
  const revenueText = methodology?.Revenue ?? defaultText;
  return {
    version: 2,
    pullHourly: true,
    doublecounted: true, // volume and fees are already counted in Lighter
    fetch: async (options: FetchOptions) => {
      if (!marketType) {
        const { dailyVolume, dailyFees } = await fetchLighterPartnerStats(options, chains[options.chain].accounts);
        return { dailyVolume, dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
      }
      const { dailyVolume, dailyNotionalVolume, dailyFees } = await fetchLighterPartnerTrades(options, chains[options.chain].accounts, marketType);
      return {
        dailyVolume,
        ...(marketType === "bo" ? { dailyNotionalVolume } : {}),
        dailyFees,
        dailyRevenue: dailyFees.clone(),
        dailyProtocolRevenue: dailyFees.clone(),
      };
    },
    adapter: chains, // start dates are read from the chain config
    methodology: {
      Volume: marketType === "bo"
        ? `Cash paid on Lighter Up or Down prediction market trades routed through ${name}'s Lighter partner account.`
        : `Notional volume of Lighter ${market} trades routed through ${name}'s Lighter partner account.`,
      ...(marketType === "bo" ? { NotionalVolume: `Shares of Lighter Up or Down prediction markets traded through ${name}'s Lighter partner account, each counted at its $1 payout.` } : {}),
      Fees: feesText,
      Revenue: revenueText,
      ProtocolRevenue: revenueText,
    },
    breakdownMethodology: {
      Fees: { [LIGHTER_PARTNER_FEES_LABEL]: feesText },
      Revenue: { [LIGHTER_PARTNER_FEES_LABEL]: revenueText },
      ProtocolRevenue: { [LIGHTER_PARTNER_FEES_LABEL]: revenueText },
    },
  };
}

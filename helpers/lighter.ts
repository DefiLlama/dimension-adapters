import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
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

export interface LighterPartnerConfig {
  name: string;
  // one entry per Lighter deployment the partner is integrated with (zklighter, robinhood)
  chains: Record<string, { start: string; accounts: LighterAccountConfig[]; deadFrom?: string }>;
}

// Adapter for a partner whose fees are all kept by the partner (no supply side).
export function exportLighterPartnerAdapter({ name, chains }: LighterPartnerConfig): SimpleAdapter {
  const feesText = `Partner fees earned by ${name} on Lighter perps trades routed through its integration.`;
  return {
    version: 2,
    pullHourly: true,
    doublecounted: true, // volume and fees are already counted in Lighter
    fetch: async (options: FetchOptions) => {
      const { dailyVolume, dailyFees } = await fetchLighterPartnerStats(options, chains[options.chain].accounts);
      return { dailyVolume, dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
    },
    adapter: chains, // start dates are read from the chain config
    methodology: {
      Volume: `Notional volume of Lighter perps trades routed through ${name}'s Lighter partner account.`,
      Fees: feesText,
      Revenue: feesText,
      ProtocolRevenue: feesText,
    },
    breakdownMethodology: {
      Fees: { [LIGHTER_PARTNER_FEES_LABEL]: feesText },
      Revenue: { [LIGHTER_PARTNER_FEES_LABEL]: feesText },
      ProtocolRevenue: { [LIGHTER_PARTNER_FEES_LABEL]: feesText },
    },
  };
}

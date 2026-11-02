import { FetchOptions } from "../adapters/types";
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

// Volume and partner fees of trades routed through a Lighter partner account in [startTimestamp, endTimestamp).
// end_timestamp is inclusive on the API side (ms), so subtract 1ms to keep hourly windows from double counting the boundary.
export async function fetchLighterPartnerStats(options: FetchOptions, accountIndex: string) {
  const url = PARTNER_STATS_URLS[options.chain];
  if (!url) throw new Error(`no Lighter partnerStats endpoint for chain ${options.chain}`);
  const res = await fetchURL(`${url}?account_index=${accountIndex}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000 - 1}`);
  if (res?.code !== 200 || res.total_volume == null || res.total_fees_earned == null)
    throw new Error(`Lighter partnerStats failed for account ${accountIndex} on ${options.chain}: ${JSON.stringify(res)}`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  dailyVolume.addUSDValue(Number(res.total_volume));
  dailyFees.addUSDValue(Number(res.total_fees_earned), LIGHTER_PARTNER_FEES_LABEL);
  return { dailyVolume, dailyFees };
}

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "./chains";

// Lighter partner (builder) attribution, the same endpoint that powers https://lighter.exchange/stats?tab=partners
// The partner list and account indexes on that page are hardcoded in its exchange-stats bundle.
const PARTNER_STATS_URL = "https://mainnet.zklighter.elliot.ai/api/v1/partnerStats";
export const LIGHTER_PARTNER_FEES_LABEL = "Lighter Partner Fees";

// Volume and partner fees of trades routed through a Lighter partner account in [startTimestamp, endTimestamp).
// end_timestamp is inclusive on the API side (ms), so subtract 1ms to keep hourly windows from double counting the boundary.
export async function fetchLighterPartnerStats(options: FetchOptions, accountIndex: string) {
  const res = await fetchURL(`${PARTNER_STATS_URL}?account_index=${accountIndex}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000 - 1}`);
  if (res?.code !== 200 || res.total_volume == null || res.total_fees_earned == null)
    throw new Error(`Lighter partnerStats failed for account ${accountIndex}: ${JSON.stringify(res)}`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  dailyVolume.addUSDValue(Number(res.total_volume));
  dailyFees.addUSDValue(Number(res.total_fees_earned), LIGHTER_PARTNER_FEES_LABEL);
  return { dailyVolume, dailyFees };
}

export function exportLighterPartnerAdapter(accountIndex: string, { name, start }: { name: string; start: string }): SimpleAdapter {
  const feesText = `Partner fees earned by ${name} on Lighter perps trades routed through its integration.`;
  return {
    version: 2,
    pullHourly: true,
    doublecounted: true, // volume and fees are already counted in Lighter
    fetch: async (options: FetchOptions) => {
      const { dailyVolume, dailyFees } = await fetchLighterPartnerStats(options, accountIndex);
      return { dailyVolume, dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
    },
    chains: [CHAIN.ZK_LIGHTER],
    start,
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

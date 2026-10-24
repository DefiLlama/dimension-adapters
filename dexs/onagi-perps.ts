import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Onagi (https://onagi.si) perps are Lighter perps on Robinhood Chain (the venue tracked by dexs/lighter-rh),
// routed through Onagi's Lighter integrator account. Lighter's public partner stats return the volume of the
// trades Onagi routed in any time window. Onagi's integrator fee from the same trades is in fees/onagi.ts.
const PARTNER_STATS = "https://api.rh.lighter.xyz/api/v1/partnerStats";
// Onagi's Lighter integrator account (fee recipient approved by every Onagi trader, see https://onagi.si/docs)
const ONAGI_ACCOUNT_INDEX = 22388;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const stats = await fetchURL(
    `${PARTNER_STATS}?account_index=${ONAGI_ACCOUNT_INDEX}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`
  );
  dailyVolume.addUSDValue(Number(stats.total_volume));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-10-22",
  doublecounted: true,
  methodology: {
    Volume: "Notional volume of Lighter perps trades (Robinhood Chain) routed through Onagi's integrator account, from Lighter's partner stats.",
  },
};

export default adapter;

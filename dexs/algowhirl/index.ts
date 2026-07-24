import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// AlgoWhirl — self-built perpetuals DEX on Arbitrum (USDC-denominated).
// Data is served from our public read-only endpoint (no auth):
//   GET https://dex.algowhirl.com/public/defillama/day?ts=<unix seconds>
//   -> { dailyVolume, dailyFees, dailyRevenue, totalVolume, totalFees, ... }
//   ts is normalized to the UTC day it falls in; returns that day's notional
//   volume / fees (USDC-denominated).
const DAY_URL = "https://dex.algowhirl.com/public/defillama/day";

const methodology = {
  Volume: "Notional value of all non-liquidation perp fills on AlgoWhirl (sum of qty*price, USDC-denominated), sourced from the exchange ledger.",
  Fees: "Taker/maker/liquidation fees paid by users.",
  Revenue: "AlgoWhirl is the counterparty (internalized market maker), so protocol revenue equals user-paid fees.",
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const d: any = await httpGet(`${DAY_URL}?ts=${options.startOfDay}`);
  return {
    dailyVolume: d.dailyVolume ?? 0,
    dailyFees: d.dailyFees ?? 0,
    dailyRevenue: d.dailyRevenue ?? 0,
    dailyProtocolRevenue: d.dailyRevenue ?? 0,
  };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2026-06-14', // first fill date
  methodology,
};

export default adapter;

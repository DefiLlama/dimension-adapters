import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const MARKETS_API = "https://api.rise.trade/v1/markets";

// Fee schedule (Tier 1): Taker 3bps, Maker 1bps — blended 2bps
const BLENDED_FEE_BPS = 2;

const fetch = async (options: FetchOptions) => {
  const response = await fetchURL(MARKETS_API);
  const markets = response.data?.markets;

  if (!markets?.length) throw new Error("RiseX markets data missing");

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const totalVolume = markets.reduce((sum: number, market: any) => {
    if (!market.available) return sum;
    return sum + Number(market.quote_volume_24h || 0);
  }, 0);

  const fees = totalVolume * BLENDED_FEE_BPS / 10000;
  dailyFees.addUSDValue(fees);
  dailyRevenue.addUSDValue(fees);

  return { dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.RISE],
  runAtCurrTime: true,
  start: "2026-04-01",
  methodology: {
    Fees: "Blended 2bps fee (Tier 1: 3bps taker + 1bps maker) applied to 24h volume across all RISEx perpetual markets.",
    Revenue: "All trading fees retained by the protocol (maker rebate program not yet live).",
  },
};

export default adapter;

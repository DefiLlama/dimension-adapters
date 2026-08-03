import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const volumeURL = "https://api.stabble.org/metric";

interface DailyStats {
  volume: number;
  fees: number;
  revenue: number;
}

const fetch = async (options: FetchOptions) => {

  const url = `${volumeURL}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const stats: DailyStats = await fetchURL(url);

  // `fees` is the LP share only (70% of gross) and `revenue` is the treasury's 30%,
  return {
    dailyVolume: stats.volume,
    dailyFees: stats.fees + stats.revenue,
    dailyRevenue: stats.revenue,
    dailySupplySideRevenue: stats.fees,
  };
};

const methodology = {
  Volume: "Trading volume across stabble's stable and weighted AMM pools.",
  Fees: "Total swap fees paid by traders — the liquidity providers' share plus the protocol's cut.",
  Revenue: "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  SupplySideRevenue: "The 70% of swap fees kept by liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-06-05',
  methodology,
};

export default adapter;

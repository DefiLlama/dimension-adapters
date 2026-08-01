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

  return {
    dailyVolume: stats.volume,
    dailyFees: stats.fees,
    dailyRevenue: stats.revenue,
    dailySupplySideRevenue: stats.fees - stats.revenue,
  };
};

const methodology = {
  Volume: "Trading volume across stabble's stable and weighted AMM pools.",
  Fees: "Total swap fees paid by traders.",
  Revenue: "The protocol's cut of swap fees (treasury / $STB staking pool).",
  SupplySideRevenue: "The portion of swap fees distributed to liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-06-05',
  methodology,
};

export default adapter;

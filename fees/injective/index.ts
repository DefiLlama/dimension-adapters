import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

interface IFeesResponse {
  exchange_fees_usd: number;
  gas_fees: number;
  total_fees_usd: number;
}

interface IRewardsResponse {
  total_reward_usd: number;
}

interface IAuctionsDailyData {
  amount_inj: string;
  amount_stablecoin: string;
  date: string;
  is_auction_day: boolean;
  price_inj: string;
  round: number;
  usd_value: string;
  winner: string;
  winning_bid: string;
}

interface IAuctionsResponse {
  days: IAuctionsDailyData[];
  total_usd_value: number;
}

const BASE_URL = "https://bigquery-api-636134865280.europe-west1.run.app";

const fetchFees = async (
  timestamp: number,
  _t: ChainBlocks,
  options: FetchOptions
) => {
  const dateStr = new Date(options.startOfDay * 1000)
    .toISOString()
    .split("T")[0];

  const feesUrl = `${BASE_URL}/fees?start_date=${dateStr}`;
  const feesRes: IFeesResponse = await httpGet(feesUrl);

  const rewardsUrl = `${BASE_URL}/rewards?start_date=${dateStr}`;
  const rewardsRes: IRewardsResponse = await httpGet(rewardsUrl);

  const auctionUrl = `${BASE_URL}/auction?start_date=${dateStr}`;
  const auctionRes: IAuctionsResponse = await httpGet(auctionUrl);

  const totalDailyFees = feesRes.total_fees_usd;
  const totalRewards = rewardsRes.total_reward_usd;

  const totalBurn = auctionRes.days.reduce((sum, day) => {
    const amountBurned = parseFloat(day.winning_bid);
    const priceInj = parseFloat(day.price_inj);
    return sum + amountBurned * priceInj;
  }, 0);

  return {
    dailyFees: totalDailyFees,
    dailyRevenue: totalDailyFees,
    dailyHoldersRevenue: totalRewards + totalBurn,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    injective: {
      fetch: fetchFees,
      start: "2021-07-16",
    },
  },
};

export default adapter;

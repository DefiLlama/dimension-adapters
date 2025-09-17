import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

interface IFeesResponse {
  exchange_fees_usd: number;
  gas_fees: number;
  total_fees_usd: number;
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
  const feesRes: IFeesResponse = await httpGet(
    `${BASE_URL}/fees?start_date=${options.dateString}`
  );
  const auctionRes: IAuctionsResponse = await httpGet(
    `${BASE_URL}/auction?start_date=${options.dateString}`
  );

  const totalDailyFees = feesRes.total_fees_usd;

  const totalBurn = auctionRes.days.reduce((sum, day) => {
    const amountBurned = parseFloat(day.winning_bid);
    const priceInj = parseFloat(day.price_inj);
    return sum + amountBurned * priceInj;
  }, 0);

  return {
    dailyFees: totalDailyFees,
    dailyRevenue: totalDailyFees + totalBurn,
    dailyHoldersRevenue: totalDailyFees + totalBurn,
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

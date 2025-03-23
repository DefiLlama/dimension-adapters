import {
    Adapter,
    FetchOptions,
  } from "../../adapters/types";
  import { CHAIN } from "../../helpers/chains";
  import fetchURL from "../../utils/fetchURL";

  const suiteBotFeesURL = 'https://crypton-be-bk6w.onrender.com/by-day';

  interface DailyMetrics {
    buy_volume_usd: number;
    day: number;
    fees_sui: number;
    fees_usd: number;
    number_of_new_users: number;
    number_of_trades: number;
    number_of_users: number;
    sell_volume_usd: number;
    volume_usd: number;
}


const fetchSuiteStats = async ({ endTimestamp }: FetchOptions) => {
    // because the API doesn't support timestamp, we need to fetch all data and filter it
    const url = `${suiteBotFeesURL}`
    const stats: DailyMetrics[] = (await fetchURL(url).then((data) => data.data));
    const closestDay = stats.reduce((prev, curr) => Math.abs(curr.day - endTimestamp) < Math.abs(prev.day - endTimestamp) ? curr : prev);
    return {
        dailyFees: closestDay.fees_usd,
        dailyRevenue: closestDay.fees_usd,
        dailyProtocolRevenue: closestDay.fees_usd / 2,
        dailyHoldersRevenue: closestDay.fees_usd / 2,
    };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSuiteStats,
      start: '2024-09-25',
      meta: {
        methodology:{
            Fees: 'Total fees paid from bot trades',
            ProtocolReveneue: '50% of the total fees goes to the treasury',
            HolderRevenue: '50% of the total fees goes to the token holders (doesn\'t include other revenue sources)'
        }
      },
    },
  },
};

export default adapter;

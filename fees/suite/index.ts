import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDateString } from "../../helpers/utils";
import { httpGet } from "../../utils/fetchURL";

const suiteBotFeesURL = 'https://crypton-be-bk6w.onrender.com/by-day';
let allStats: any


const fetchSuiteStats = async (_: any, _1: any, { dateString }: FetchOptions) => {
  // because the API doesn't support timestamp, we need to fetch all data and filter it
  if (!allStats) {
    const { data } = await httpGet(suiteBotFeesURL)
    allStats = {}
    data.forEach((stat: any) => { allStats[getDateString(stat.day)] = stat })
  }

  const closestDay = allStats[dateString]
  if (!closestDay) {
    throw new Error(`No data found for ${dateString}`)
  }

  return {
    dailyFees: closestDay.fees_usd,
    dailyRevenue: closestDay.fees_usd,
    dailyProtocolRevenue: closestDay.fees_usd / 2,
    dailyHoldersRevenue: closestDay.fees_usd / 2,
  };
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSuiteStats,
      start: '2024-09-25',
    },
  },
  methodology: {
    Fees: 'Total fees paid from bot trades',
    Revenue: 'Total fees paid from bot trades',
    ProtocolReveneue: '50% of the total fees goes to the treasury',
    HoldersRevenue: '50% of the total fees goes to the token holders (doesn\'t include other revenue sources)'
  }
};

export default adapter;

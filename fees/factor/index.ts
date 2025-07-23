// https://docs.factor.fi/governance/factordao/platform-fees#harvest-fees
// https://docs.factor.fi/factor-sdk/rest-apis/utility-apis/stats

import axios from "axios";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const url = "https://factor-stats-api.fly.dev/stats/dao-revenues/";

interface Date {
  year: number;
  month: number;
  day: number;
}

const getFormattedDate = (timestamp: number): Date => {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return { year, month, day };
};

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const { year, month, day } = getFormattedDate(timestamp);
  const { data } = await axios.get(`${url}${year}/${month}`);
  const dateKey = `${year}-${month}-${day}`;
  const relevantData = data[dateKey];

  return {
    timestamp,
    dailyFees: relevantData.todayIncome,
    dailyRevenue: relevantData.todayIncome / 2,
  };
};
const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-05-03',
    },
  },
};

export default adapter;

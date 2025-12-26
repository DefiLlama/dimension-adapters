import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

interface IDuneResult {
  timestamp: number;
  daily_revenue: number;
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  
  const duneData: IDuneResult[] = await queryDune("6421240");
  

  const filteredData = duneData.filter((item: IDuneResult) => {
    if (startTimestamp && item.timestamp < startTimestamp) return false;
    if (endTimestamp && item.timestamp > endTimestamp) return false;
    return true;
  });

  // Calculate daily fees and revenue
  const dailyFees = filteredData.reduce((acc: number, item: IDuneResult) => {
    return acc + (item.daily_revenue || 0);
  }, 0);

  return {
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyFees.toString(),
    timestamp: endTimestamp || Math.floor(Date.now() / 1000),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: 1704067200, 
    },
  },
};

export default adapter;
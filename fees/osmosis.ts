import { Adapter, FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IChartItem {
  timestamp: string;
  dailyFees: number;
  dailyRevenue: number;
}

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const feeEndpoint = `https://public-osmosis-api.numia.xyz/external/defillama/chain_fees_and_revenue`;
  const historicalFees: IChartItem[] = await fetchURL(feeEndpoint);

  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay);
  const dateStr = new Date(dayTimestamp * 1000).toISOString().split('T')[0];

  const dayData = historicalFees.find(feeItem => 
    feeItem.timestamp.split(' ')[0] === dateStr
  );
  if (!dayData) {
    throw new Error(`No data found for ${dateStr}`);
  }

  return {
    dailyFees: dayData.dailyFees,
    dailyRevenue: dayData.dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.COSMOS]: {
      fetch,
      start: '2022-04-15',
    },
  },
};

export default adapter;

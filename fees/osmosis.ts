import { Adapter, FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

interface IChartItem {
  timestamp: string;
  dailyFees: number;
  dailyRevenue: number;
}

const fetch = async (_a:any, _b:any, { dateString }: FetchOptions) => {
  const feeEndpoint = `https://public-osmosis-api.numia.xyz/external/defillama/chain_fees_and_revenue`;
  const historicalFees: IChartItem[] = await fetchURL(feeEndpoint);

  const dayData = historicalFees.find(feeItem => 
    feeItem.timestamp.split(' ')[0] === dateString
  );
  if (!dayData) {
    throw new Error(`No data found for ${dateString}`);
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

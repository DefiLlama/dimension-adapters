import { Adapter, FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

interface IChartItem {
  timestamp: string;
  dailyFees: number;
  dailyRevenue: number;
}

const fetch = async (_a: any, _b: any, { dateString }: FetchOptions) => {
  const feeEndpoint = `https://public-osmosis-api.numia.xyz/external/defillama/chain_fees_and_revenue?chain=stride`;
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
      start: '2023-09-01',
    },
  },
  methodology: {
    Fees: "Fees are staking rewards earned by tokens staked with Stride. They are measured across Stride's LSD tokens' yields and converted to USD terms.",
    Revenue: "Stride collects 10% of liquid staked assets's staking rewards. These fees are measured across Stride's LSD tokens' yields and converted to USD terms.",
  },
};

export default adapter; // yarn test fees stride

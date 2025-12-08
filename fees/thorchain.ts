import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface IChartItem {
  timestamp: string;
  dailyFees: number;
  dailyRevenue: number;
}

const fetch = async (_a: any, _b: any, { dateString }: FetchOptions) => {
  const feeEndpoint = `https://public-osmosis-api.numia.xyz/external/defillama/chain_fees_and_revenue?chain=thorchain`;
  const historicalFees: IChartItem[] = await fetchURL(feeEndpoint);

  const dayData = historicalFees.find((feeItem) =>
    feeItem.timestamp.split(" ")[0] === dateString
  );

  if (!dayData) {
    throw new Error(`No chain fees data found for ${dateString}`);
  }

  return {
    dailyFees: dayData.dailyFees,
    dailyRevenue: dayData.dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.THORCHAIN]: {
      fetch,
      start: "2021-04-01",
    },
  },
  protocolType: "chain" as any,
};

export default adapter;

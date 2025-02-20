import { Adapter, FetchResultV2, FetchV2 } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

interface IChartItem {
  labels: string;
  protorev: number;
  swap_fees: number;
  taker_fees: number;
}

const fetch: FetchV2 = async ({
  startTimestamp,
  endTimestamp,
}): Promise<FetchResultV2> => {
  const startDate = new Date(startTimestamp * 1000).toISOString().slice(0, 10);
  const endDate = new Date(endTimestamp * 1000).toISOString().slice(0, 10);
  const feeEndpoint = `https://www.datalenses.zone/numia/osmosis/lenses/hourly_revenue?start_date=${startDate}&end_date=${endDate}`;
  const historicalFees: IChartItem[] = await fetchURL(feeEndpoint);

  let dailyFees: number = 0;
  let dailyRevenue: number = 0;

  historicalFees
    .filter((feeItem) => {
      const date = new Date(feeItem.labels).getTime() / 1000;
      return date >= startTimestamp && date <= endTimestamp;
    })
    .map(({ protorev, swap_fees, taker_fees }) => {
      dailyRevenue += protorev;
      dailyFees += swap_fees;
      dailyFees += taker_fees;
    });

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.COSMOS]: {
      fetch,
      start: '2022-10-17',
    },
  },
};

export default adapter;

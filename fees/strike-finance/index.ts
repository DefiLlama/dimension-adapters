import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const {
    data: { dailyRevenue },
  } = await axios.get(
    `https://tidelabs.io:2121/defillama/strike-finance/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );
  const dailyRevenueUSD = options.createBalances();
  dailyRevenueUSD.addCGToken('cardano', Number(dailyRevenue));
  const dailyFeesUSD = dailyRevenueUSD.clone();
  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFeesUSD,
    dailyRevenue: dailyRevenueUSD,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2024-05-16',
    },
  },
};

export default adapter;

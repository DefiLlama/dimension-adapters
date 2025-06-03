import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const {
    data: { dailyFees, dailyRevenue },
  } = await axios.get(
    `https://tidelabs.io:2121/defillama/strike-finance/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );
  const dailyFeesUSD = options.createBalances();
  const dailyRevenueUSD = options.createBalances();
  dailyFeesUSD.addCGToken('cardano', Number(dailyFees));
  dailyRevenueUSD.addCGToken('cardano', Number(dailyRevenue));
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
  allowNegativeValue: true,
};

export default adapter;

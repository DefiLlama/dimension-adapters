import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const {
    data: { dailyFees, dailyRevenue },
  } = await axios.get(
    `https://tidelabs.io:2121/defillama/bodega-market/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );
  const dailyFeesUSD = options.createBalances();
  const dailyRevenueUSD = options.createBalances();
  dailyFeesUSD.addCGToken("cardano", Number(dailyFees));
  dailyRevenueUSD.addCGToken("cardano", Number(dailyRevenue));
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
      start: "2024-06-4",
      meta: {
        methodology: {
          Fees: "All betting fees collected, which are distributed to market creators and staking users.",
          Revenue: "All betting fees distributed specifically to staking users.",
        },
      },
    },
  },
};

export default adapter;

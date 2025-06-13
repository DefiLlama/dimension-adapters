import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const {
    data: { dailyFees, dailyRevenue, dailyHoldersRevenue },
  } = await axios.get(
    `https://tidelabs.io:2121/defillama/bodega-market/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );
  const dailyFeesUSD = options.createBalances();
  const dailyRevenueUSD = options.createBalances();
  const dailyHoldersRevenueUSD = options.createBalances();
  dailyFeesUSD.addCGToken("cardano", Number(dailyFees));
  dailyRevenueUSD.addCGToken("cardano", Number(dailyRevenue));
  dailyHoldersRevenueUSD.addCGToken("cardano", Number(dailyHoldersRevenue));
  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFeesUSD,
    dailyRevenue: dailyRevenueUSD,
    dailyHoldersRevenue: dailyHoldersRevenueUSD,

    // no protocol revenue
    dailyProtocolRevenue: 0,
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
          Fees: "All betting fees (4% of total protocol volume) paid by users.",
          Revenue: "All betting fees (4% of total protocol volume) paid by users.",
          HoldersRevenue: "All revenue distributed to BODEGA holders.",
          ProtocolRevenue: "No revenue for Bodega protocol.",
        },
      },
    },
  },
};

export default adapter;

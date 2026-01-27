import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const data = await fetchURL(`https://tidelabs.io/api/defillama/jpg-store/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`);

  const dailyFeesUSD = options.createBalances();
  const dailyRevenueUSD = options.createBalances();

  dailyFeesUSD.addCGToken("cardano", Number(data.dailyFees));
  dailyRevenueUSD.addCGToken("cardano", Number(data.dailyRevenue));

  return {
    dailyFees: dailyFeesUSD,
    dailyUserFees: dailyFeesUSD,
    dailyRevenue: dailyRevenueUSD,
    dailyProtocolRevenue: dailyRevenueUSD,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2024-06-08",
    },
  },
  methodology: {
    Fees: "All service fees collected from NFT sales",
    UserFees: "All service fees collected from NFT sales",
    Revenue: " service fees collected from NFT sales to protocol",
    ProtocolRevenue: "service fees collected from NFT sales to protocol",
  },
};

export default adapter;

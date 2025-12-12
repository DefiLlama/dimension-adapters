import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FEE_WALLETS = ["0xaBd078dA1e9478964694fE764256d6045d06A749"];

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = await addTokensReceived({ options, targets: FEE_WALLETS });

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Aggregator fees paid by users.",
    Revenue: "Aggregator revenue paid by users.",
    ProtocolRevenue: "Aggregator revenue going to the protocol.",
  },
  adapter: {
    [CHAIN.STORY]: {
      fetch,
      start: "2025-10-01",
    },
  },
};

export default adapter;

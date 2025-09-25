import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const targets = ["9QZgt11ev2g2J1fBUEfYbsjNUiDG9r3LTKwPhkNhuHzY"];
  const dailyFees = await getSolanaReceived({
    blacklists: targets,
    options,
    targets,
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: "2025-03-27",
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: "User pays 1% fee on each trade",
    Revenue: "Portion of fees collected by XTrade",
    ProtocolRevenue: "Portion of fees collected by XTrade",
  },
};

export default adapter;

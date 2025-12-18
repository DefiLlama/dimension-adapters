import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const wallets = ['9QZgt11ev2g2J1fBUEfYbsjNUiDG9r3LTKwPhkNhuHzY']

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    blacklists: wallets,
    options,
    targets: wallets,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-03-27",
  methodology: {
    Fees: "User pays 1% fee on each trade.",
    Revenue: "XTrade collects all fees as revenue.",
    ProtocolRevenue: "XTrade collects all fees as revenue.",
  },
};

export default adapter;

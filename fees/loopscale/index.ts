import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const LOOPSCALE_PROGRAM_ID = "1oopBoJG58DgkUVKkEzKgyG9dvRmpgeEm1AVjoHkF78";

const FEE_COLLECTORS = [
  LOOPSCALE_PROGRAM_ID,
];

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: FEE_COLLECTORS,
  });

  const dailyRevenue = dailyFees.clone();

  return { dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: "2024-01-01",
    },
  },
  methodology: {
    Fees: "Total fees collected by Loopscale protocol including lending interest, liquidation fees, and vault fees",
    Revenue: "Protocol revenue from all fee sources",
  },
  isExpensiveAdapter: true,
};

export default adapter;

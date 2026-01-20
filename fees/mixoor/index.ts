import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const solanaFetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    target: "9qX97Bd8dvHAknHVjCxz4uEJcPSE3NGjjgniMVdDBu6d",
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All fees paid by users to use Mixoor. 0.35% SOL on transfers",
  Revenue: "All fees are collected by Mixoor protocol.",
  ProtocolRevenue: "Trading fees are collected by Mixoor protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: solanaFetch,
    },
  },
  start: "2025-12-22",
  isExpensiveAdapter: true,
};

export default adapter;

import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
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
  Fees: "All fees paid by users to use Mixoor. 0.15% SOL/SPL token on transfers",
  Revenue: "All fees are collected by Mixoor protocol.",
  ProtocolRevenue: "Transfer fees are collected by Mixoor protocol.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  methodology,
  start: "2025-12-22",
  isExpensiveAdapter: true,
};

export default adapter;

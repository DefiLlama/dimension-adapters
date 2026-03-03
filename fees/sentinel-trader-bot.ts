import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const FEE_COLLECTION_ADDRESS = 'FiPhWKk6o16WP9Doe5mPBTxaBFXxdxRAW9BmodPyo9UK';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: [FEE_COLLECTION_ADDRESS],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-02-14',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All trading fees paid by users while using Sentinel Trader Bot.",
    Revenue: "Trading fees are collected by Sentinel Trader Bot protocol.",
    ProtocolRevenue: "Trading fees are collected by Sentinel Trader Bot protocol.",
  }
}

export default adapter;

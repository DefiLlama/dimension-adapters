import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";

// Fees are hardcoded in Pair.swap function in pair contract.
const feeConfig = {
  fees: 0.0029,
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
}

const chainConfig: Record<string, { start: string; factory: string; allowReadPairs: true }> = {
  [CHAIN.AVAX]: {
    start: "2023-09-19",
    factory: "0xc009a670e2b02e21e7e75ae98e254f467f7ae257",
    allowReadPairs: true,
  },
  [CHAIN.TELOS]: {
    start: "2024-01-17",
    factory: "0xDef9ee39FD82ee57a1b789Bc877E2Cbd88fd5caE",
    allowReadPairs: true,
  }, // No Pair created till date, expect 0 values.
  // [CHAIN.APECHAIN]: no active contract, no pools to track // subgraph inactive
}

const uniV2Adapter = uniV2Exports(Object.fromEntries(
  Object.entries(chainConfig).map(([chain, config]) => [chain, { ...config, ...feeConfig }])
))

const fetch = (options: FetchOptions) =>
  (uniV2Adapter.adapter![options.chain].fetch as (options: FetchOptions) => any)(options)

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
};

export default adapter;

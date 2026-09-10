/**
 * DeFiLlama fees adapter — Accrued protocol fees (currently $0).
 *
 * Copy to: dimension-adapters/fees/accrued.ts
 */
import type { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";

const START_BLOCK = 59334164;

async function fetch(_options: FetchOptions): Promise<FetchResult> {
  return {
    dailyFees: 0,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    robinhood: {
      start: START_BLOCK,
      fetch,
    },
  },
  methodology: {
    Fees: "Accrued does not charge an interface fee. Uniswap LP fees are not Accrued protocol revenue.",
    Revenue: "No protocol revenue until an on-chain fee is added to AccruedSwapRouter.",
    ProtocolRevenue: "Zero.",
  },
};

export default adapter;

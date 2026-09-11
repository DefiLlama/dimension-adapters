/**
 * DeFiLlama fees adapter — Accrued protocol fees (currently $0).
 *
 * Copy to: dimension-adapters/fees/accrued.ts
 */
import type { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/** AccruedSwapRouter deploy date on Robinhood mainnet (block 59334164). */
const ROUTER_START = "2026-09-10";

/**
 * Accrued charges no interface or protocol fee today.
 * Returns zero fee metrics until an on-chain fee is added to AccruedSwapRouter.
 */
async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  void options.startOfDay;
  return {
    dailyFees: 0,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: ROUTER_START,
  chains: [CHAIN.ROBINHOOD],
  methodology: {
    Fees: "Accrued does not charge an interface fee. Uniswap LP fees are not Accrued protocol revenue.",
    Revenue: "No protocol revenue until an on-chain fee is added to AccruedSwapRouter.",
    ProtocolRevenue: "Zero.",
  },
  breakdownMethodology: {},
};

export default adapter;

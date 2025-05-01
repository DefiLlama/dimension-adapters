/**
 * Across Adapter
 * 
 * NOTE: This implementation uses Dune queries rather than event-based calculations.
 * 
 * Previous event-based methods had bugs because:
 * 1. Events don't provide enough data points to accurately estimate fees
 * 2. Simple inputAmount-outputAmount calculations are incorrect as token amounts 
 *    have different decimal precision across chains
 * 3. Cross-chain token swaps (e.g., ETH from Arbitrum to USDC on Base) 
 *    complicates fee calculations
 * 
 * This Dune-based approach provides more accurate fee calculations by directly 
 * querying processed cross-chain transfer data.
 */

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

interface IResponse {
  dst_chain: string;
  fees: number;
  lp_fees: number;
}

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    SELECT
        dst_chain
        , SUM(relay_fee_in_usd) as fees
        , SUM(lp_fee_in_usd) as lp_fees
    FROM dune.risk_labs.result_across_transfers_foundation
    WHERE relay_fee_in_usd is not null
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY dst_chain
  `);
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const results: IResponse[] = options.preFetchedResults || [];
  const chainData = results.find(item => item.dst_chain === options.chain);
  
  const dailyFees = chainData?.fees || 0;

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-04-30",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2023-04-30",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2023-04-30",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2023-04-30",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2023-08-22",
    },
    [CHAIN.ZKSYNC]: {
      fetch,
      start: "2023-08-10",
    },
    [CHAIN.LINEA]: {
      fetch,
      start: "2024-04-20",
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: "2025-02-06",
    },
    [CHAIN.BLAST]: {
      fetch,
      start: "2024-07-10",
    },
    [CHAIN.SCROLL]: {
      fetch,
      start: "2024-07-31",
    },
  },
  prefetch: prefetch,
  isExpensiveAdapter: true,
};

export default adapter;

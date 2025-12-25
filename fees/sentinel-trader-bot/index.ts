import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

/*
 * Sentinel Trader Bot Fee Adapter
 *
 * STATUS: Adapter working correctly - tracks small fee amounts
 * - Address receives ~27.77 SOL total since June 2024 (1,609 transactions)
 * - Average transaction: ~0.017 SOL (can track fees as small as 0.000001 SOL)
 * - 0 fees on test dates means no activity on those specific days
 *
 * Configuration based on Sentinel Trader Bot's TVL adapter
 * Fee collection wallet found from: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/sentinel-trader-bot/index.js
 */

const FEE_COLLECTION_ADDRESS = 'FiPhWKk6o16WP9Doe5mPBTxaBFXxdxRAW9BmodPyo9UK'; // From Sentinel Trader Bot TVL adapter

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    SELECT
      SUM(CASE WHEN balance_change > 0 THEN balance_change / 1e9 ELSE 0 END) AS fee
    FROM
      solana.account_activity
    WHERE
      TIME_RANGE
      AND address = '${FEE_COLLECTION_ADDRESS}'
      AND balance_change > 0
      AND tx_success
  `;

  const fees = await queryDuneSql(options, query);

  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

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
  dependencies: [Dependencies.DUNE],
  start: '2024-06-01', // Approximate launch date 
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading fees paid by users while using Sentinel Trader Bot.",
    Revenue: "Trading fees are collected by Sentinel Trader Bot protocol.",
    ProtocolRevenue: "Trading fees are collected by Sentinel Trader Bot protocol.",
  }
}

export default adapter;

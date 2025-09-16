import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Hylo Protocol fee accounts
const HYUSD_FEE_ACCOUNT = "3HT6dD6APJh89XJs9rkn3BmsvkXE9jPG9dWJmUjWu6TS";
const JITOSOL_FEE_ACCOUNT = "FpLaqELxKRm6S3bjfNSknwZu43TL89VYkwuMDwsRMj59";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const dailyYields = options.createBalances();
  const dailyFees = options.createBalances();

  // Query for protocol fees (revenue)
  const revenueQuery = `
    SELECT
      token_mint_address,
      SUM(amount) AS total_fees,
      'revenue' AS data_type
    FROM
      tokens_solana.transfers
    WHERE
      TIME_RANGE
      AND (
        (to_owner = '${HYUSD_FEE_ACCOUNT}' AND token_mint_address = '5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E') 
        OR 
        (to_owner = '${JITOSOL_FEE_ACCOUNT}' AND token_mint_address = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn')
      )
    GROUP BY
      token_mint_address
  `;

  // Query for stability pool yields distributed to users
  const yieldsQuery = `
    WITH stability_pool_yields AS (
      SELECT 
        tx_id,
        token_mint_address,
        amount
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND to_owner = '5YrRAQag9BbJkauDtJkd1vsTquXT6N46oU8rJ66GDxHd'
        AND token_mint_address = '5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E'
        AND from_owner IS NULL  -- Only actual mints
    ),
    xsol_transfer_txs AS (
      SELECT DISTINCT tx_id
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND token_mint_address = '4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs'  -- xSOL
        AND amount > 0
    )
    SELECT 
      token_mint_address,
      SUM(amount) AS total_fees,
      'yield' AS data_type
    FROM stability_pool_yields s
    LEFT JOIN xsol_transfer_txs x ON s.tx_id = x.tx_id
    WHERE x.tx_id IS NULL  -- Exclude transactions with any xSOL transfers
                           -- This is because stability pool operations also mint/burn hyUSD to this wallet,
                           -- so if a transaction has xSOL movement it means it's not a yield distribution but just a swap
    GROUP BY token_mint_address
  `;
  // Combine both queries into one to reduce query cost
  const combinedQuery = `
    WITH revenue_data AS (
      ${revenueQuery}
    ),
    yields_data AS (
      ${yieldsQuery}
    )
    SELECT * FROM revenue_data
    UNION ALL 
    SELECT * FROM yields_data
  `;
  const combinedData = await  queryDuneSql(options, combinedQuery)
  const revenue = combinedData.filter(i => i.data_type === 'revenue');
  const yields = combinedData.filter(i => i.data_type === 'yield');

  // Process protocol fees (revenue)
  revenue.forEach((row: any) => {
    if (row.token_mint_address === '5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E') {
      // hyUSD is pegged to $1, so we can add it as USD value directly
      dailyRevenue.addUSDValue(row.total_fees / 1e6); // 6 decimals for hyUSD
    } else {
      // For other tokens (like jitoSOL), use automatic price conversion
      dailyRevenue.add(row.token_mint_address, row.total_fees);
    }
  });

  // Process stability pool yields
  yields.forEach((row: any) => {
    if (row.token_mint_address === '5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E') {
      // hyUSD is pegged to $1, so we can add it as USD value directly
      dailyYields.addUSDValue(row.total_fees / 1e6); // 6 decimals for hyUSD
    }
  });

  // Calculate total user fees (revenue + yields)
  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailyYields);

  return {
    dailyRevenue,           // Protocol revenue only
    dailySupplySideRevenue: dailyYields, // Stability pool yields distributed to users
    dailyFees          // Protocol revenue + stability pool yields
  }
}

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "hyUSD <-> xSOL swap fees and stability pool yields (in hyUSD) distributed to users.",
    Revenue: "Swap fees, and part of jtoSOL yield",
    SupplySideRevenue: "Stability pool yields (in hyUSD) distributed to users.",
  },
  version: 1,
  fetch,
  start: '2025-04-01',
  chains: [CHAIN.SOLANA],
  isExpensiveAdapter: true
};

export default adapter;

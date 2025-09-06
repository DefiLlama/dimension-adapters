import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Hylo Protocol fee accounts
const HYUSD_FEE_ACCOUNT = "3HT6dD6APJh89XJs9rkn3BmsvkXE9jPG9dWJmUjWu6TS";
const JITOSOL_FEE_ACCOUNT = "FpLaqELxKRm6S3bjfNSknwZu43TL89VYkwuMDwsRMj59";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    SELECT
      token_mint_address,
      SUM(amount) AS total_fees
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

  const fees = await queryDuneSql(options, query);

  fees.forEach((row: any) => {
    if (row.token_mint_address === '5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E') {
      // hyUSD is pegged to $1, so we can add it as USD value directly
      dailyFees.addUSDValue(row.total_fees / 1e6); // 6 decimals for hyUSD
    } else {
      // For other tokens (like jitoSOL), use automatic price conversion
      dailyFees.add(row.token_mint_address, row.total_fees);
    }
  });

  return { 
    dailyFees, 
    dailyRevenue: dailyFees, 
    dailyProtocolRevenue: dailyFees 
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2025-04-01',
    },
  },
  isExpensiveAdapter: true
};

export default adapter;

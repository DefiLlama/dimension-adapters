import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';

const treasuryAddress = 'h7HnoyxPxBW25UaG6ayo4jSSmFARX9DmpYhbNZsLfiP'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT
      SUM(balance_change/1e9) AS total_fees
    FROM solana.account_activity
    WHERE address = '${treasuryAddress}'
      AND balance_change > 0
      AND tx_success = true
      AND TIME_RANGE
  `;
  const res = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken("solana", res[0]?.total_fees || 0);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyUserFees: dailyFees }
}

const methodology = {
  Fees: "Platform fees is 3.75% of total liquidity migrated.",
  UserFees: "Platform fees is 3.75% of total liquidity migrated.",
  Revenue: "3.75% of total liquidity migrated.",
  ProtocolRevenue: "3.75% of total liquidity migrated.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2025-09-19',
  chains: [CHAIN.SOLANA],
  methodology
}

export default adapter

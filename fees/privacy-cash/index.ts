import { CHAIN } from "../../helpers/chains";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT
      'So11111111111111111111111111111111111111112' as token,
      (COALESCE(SUM(CASE WHEN balance_change < 0 THEN abs(balance_change) END), 0) * 0.0035
        + COALESCE(COUNT(CASE WHEN balance_change < 0 THEN 1 END), 0) * 0.006 * POWER(10, 9)) as total_fees
    FROM solana.account_activity
    WHERE address = '4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh'
      AND block_time > TIMESTAMP '2025-08-15 00:00:00 UTC'
      AND TIME_RANGE

    UNION ALL

    SELECT
      token_mint_address as token,
      COALESCE(SUM(amount), 0) as total_fees
    FROM tokens_solana.transfers
    WHERE from_owner = '2vV7xhCMWRrcLiwGoTaTRgvx98ku98TRJKPXhsS8jvBV'
      AND to_owner = 'AWexibGxNFKTa1b5R5MN4PJr9HWnWRwf8EW9g8cLx3dM'
      AND block_time > TIMESTAMP '2025-12-09 00:00:00 UTC'
      AND TIME_RANGE
    GROUP BY token_mint_address
  `
  const result = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();

  result.forEach((row: any) => {
    dailyFees.add(row.token, row.total_fees);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: '0',
  }
}

const methodology = {
  Fees: "0.35% + 0.006 SOL on each withdrawal, 0.35% + ~0.008 SOL on each swap",
  Revenue: "0.35% + 0.006 SOL on each withdrawal, 0.35% + ~0.008 SOL on each swap",
  ProtocolRevenue: "0.35% + 0.006 SOL on each withdrawal, 0.35% + ~0.008 SOL on each swap",
}

const adapter: Adapter = {
  methodology,
  version: 1,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: '2025-08-15',
  isExpensiveAdapter: true,
}

export default adapter;

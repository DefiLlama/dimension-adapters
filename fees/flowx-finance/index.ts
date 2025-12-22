import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_1: any, _2: any, options: FetchOptions): Promise<FetchResult> => {
  const query = `
    WITH flowx_txns AS (
      SELECT
        date,
        transaction_digest,
        total_gas_cost
      FROM sui.transactions
      WHERE
        execution_success = TRUE
        AND (
          packages LIKE '%0x25929e7f29e0a30eb4e692952ba1b5b65a3a4d65ab5f2a32e1ba3edcb587f26d%'
          OR packages LIKE '%0xba153169476e8c3114962261d1edc70de5ad9781b83cc617ecc8c1923191cae0%'
        )
    )
    SELECT
      date,
      SUM(total_gas_cost / 1e9) AS total_rev  -- Convert MIST to SUI
    FROM flowx_txns
    WHERE date >= from_unixtime(${options.startTimestamp})
      AND date <= from_unixtime(${options.endTimestamp})
    GROUP BY date
    ORDER BY date
  `;
  const chainData = await queryDuneSql(options, query)
  const dailyFees = options.createBalances()
  chainData.forEach((day: any) => {
    dailyFees.addCGToken('sui', day.total_rev);
  });

  return { dailyFees, dailyRevenue: dailyFees, };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  start: '2025-07-01',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Total gas fees paid on FlowX CLMM/AMM transactions (SUI)',
    Revenue: 'Total gas fees paid on FlowX CLMM/AMM transactions (SUI)',
  }
};

export default adapter;



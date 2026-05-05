import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (_a: number, _b: any, options: FetchOptions) => {
  const rows = await queryDuneSql(options, `
    WITH openInterestChanges AS (
      SELECT *
      FROM query_4086137
      WHERE blockchain = 'Arbitrum'
    ),
    openInterestByDay AS (
      SELECT
        date_trunc('day', block_time) AS block_date,
        SUM(SUM(amount)) OVER (ORDER BY date_trunc('day', block_time) ASC) AS openInterestUSD,
        SUM(SUM(IF(direction = 'Long', amount, NULL))) OVER (ORDER BY date_trunc('day', block_time) ASC) AS longOpenInterestUSD,
        SUM(SUM(IF(direction = 'Short', amount, NULL))) OVER (ORDER BY date_trunc('day', block_time) ASC) AS shortOpenInterestUSD
      FROM openInterestChanges
      GROUP BY 1
    )
    SELECT openInterestUSD, longOpenInterestUSD, shortOpenInterestUSD
    FROM openInterestByDay
    WHERE block_date = DATE '${options.dateString}'
  `);

  const row = rows?.[0];

  return {
    // A handful of datapoints have a negative value, so we guard against that
    // by rounding those values up to zero
    openInterestAtEnd: Math.max(0, row?.openInterestUSD ?? 0),
    longOpenInterestAtEnd: Math.max(0, row?.longOpenInterestUSD ?? 0),
    shortOpenInterestAtEnd: Math.max(0, row?.shortOpenInterestUSD ?? 0),
  };
};

const adapter: SimpleAdapter = {
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: '2024-09-20',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;

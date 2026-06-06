import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const oiData = await queryDuneSql(options, `
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
    SELECT COALESCE(openInterestUSD, 0) as openInterestUSD, COALESCE(longOpenInterestUSD, 0) as longOpenInterestUSD, COALESCE(shortOpenInterestUSD, 0) as shortOpenInterestUSD
    FROM openInterestByDay
    WHERE block_date <= DATE '${options.dateString}'
    ORDER BY block_date DESC
    LIMIT 1
  `);

  return {
    // A handful of datapoints have small negative values (e-11), so we guard against that
    // by rounding those values up to zero
    openInterestAtEnd: Math.max(0, oiData[0].openInterestUSD),
    longOpenInterestAtEnd: Math.max(0, oiData[0].longOpenInterestUSD),
    shortOpenInterestAtEnd: Math.max(0, oiData[0].shortOpenInterestUSD),
  };
};

const adapter: SimpleAdapter = {
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: '2024-09-20',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  deadFrom: '2026-01-12',
};

export default adapter;

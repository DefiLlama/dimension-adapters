import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const prefetch = async (options: FetchOptions) => {
  const query = `
        WITH merged AS (
      SELECT
          resolve_time,
          chain,
          usd_ggr
      FROM dune.azuro.result_ordinars_combos_resolved
      WHERE status != 'Accepted'
      UNION ALL
      SELECT
          resolve_time,
          chain,
          usd_ggr
      FROM dune.azuro.result_v_3_stacked_resolved_bets
      WHERE bet_status != 'accepted'
    ),
    normalized AS (
      SELECT
          date_trunc('day', resolve_time) AS period,
          CASE
              WHEN lower(chain) LIKE 'gnosis%'  THEN '${CHAIN.XDAI}'
              WHEN lower(chain) LIKE 'polygon%' THEN '${CHAIN.POLYGON}'
              WHEN lower(chain) LIKE 'base%'    THEN '${CHAIN.BASE}'
              ELSE chain
          END AS chain_group,
          usd_ggr
      FROM merged
      WHERE resolve_time IS NOT NULL
        AND resolve_time >= FROM_UNIXTIME(${options.startTimestamp})
        AND resolve_time <  FROM_UNIXTIME(${options.endTimestamp})
    )
    SELECT
      period,
      chain_group,
      SUM(usd_ggr) AS dailyRevenue,
      SUM(usd_ggr) AS dailyFees
    FROM normalized
    GROUP BY 1, 2
    ORDER BY 1, 2
  `
  const results = await queryDuneSql(options, query);
  return results;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const prefetchResults = options.preFetchedResults || [];

  if (options.chain == CHAIN.CHILIZ) {
    return { dailyFees, dailyRevenue };
  }
  if (prefetchResults && prefetchResults.length > 0) {
    for (const row of prefetchResults) {
      if (row.chain_group == options.chain) {
        dailyFees.addUSDValue(row.dailyFees);
        dailyRevenue.addUSDValue(row.dailyRevenue);
      }
    }
    return { dailyFees, dailyRevenue };
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const methodology = {
  Fees: "Total pools profits (equals total bets amount minus total won bets amount)",
  Revenue: "Total pools profits (equals total bets amount minus total won bets amount)",
};

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.POLYGON]: {
      start: '2022-12-01',
    },
    [CHAIN.XDAI]: {
      start: '2022-01-01',
    },
    [CHAIN.BASE]: {
      start: '2024-02-01',
    },
    [CHAIN.CHILIZ]: {
      start: '2024-07-09',
      deadFrom: '2025-05-06'
    }
  },
  dependencies: [Dependencies.DUNE],
  prefetch,
  isExpensiveAdapter: true,
  methodology,
  allowNegativeValue: true,
};

export default adapter;

import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const prefetch = async (options: FetchOptions) => {
  const now = Date.now()
  const tenHoursAgo = now - (10 * 60 * 60 * 1000)
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
  }

  const query = `
    WITH merged AS (
      SELECT
        resolve_time,
        chain,
        usd_ggr,
        usd_amount
      FROM dune.azuro.result_ordinars_combos_resolved
      WHERE status != 'Accepted'
      UNION ALL
      SELECT
        resolve_time,
        chain,
        usd_ggr,
        usd_amount
      FROM dune.azuro.result_v_3_stacked_resolved_bets
      WHERE bet_status != 'accepted'
      UNION ALL
      SELECT
        call_block_time AS resolve_time,
        'linea' AS chain,
        (CAST(finalReserve AS DOUBLE) - CAST(lockedReserve AS DOUBLE)) / 1e6 AS usd_ggr,
        0 AS usd_amount
      FROM azuro_linea.lpv2_call_addreserve
      WHERE call_success = true
    ),
    normalized AS (
      SELECT
        CASE
          WHEN lower(chain) LIKE 'gnosis%'  THEN '${CHAIN.XDAI}'
          WHEN lower(chain) LIKE 'polygon%' THEN '${CHAIN.POLYGON}'
          WHEN lower(chain) LIKE 'base%'    THEN '${CHAIN.BASE}'
          ELSE chain
        END AS chain_group,
        usd_ggr,
        usd_amount
      FROM merged
      WHERE resolve_time IS NOT NULL
        AND resolve_time >= FROM_UNIXTIME(${options.startTimestamp})
        AND resolve_time <  FROM_UNIXTIME(${options.endTimestamp})
    )
    SELECT
      chain_group,
      SUM(usd_ggr) AS dailyFees,
      SUM(usd_ggr) AS dailyRevenue,
      COALESCE(SUM(usd_amount), 0) AS dailyVolume
    FROM normalized
    GROUP BY 1
    ORDER BY 1
  `
  return await queryDuneSql(options, query);
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyVolume = options.createBalances();
  const prefetchResults = options.preFetchedResults || [];

  if (options.chain == CHAIN.CHILIZ) {
    return { dailyFees, dailyRevenue, dailyVolume };
  }

  if (prefetchResults && prefetchResults.length > 0) {
    for (const row of prefetchResults) {
      if (row.chain_group == options.chain) {
        dailyFees.addUSDValue(row.dailyFees);
        dailyRevenue.addUSDValue(row.dailyRevenue);
        dailyVolume.addUSDValue(row.dailyVolume);
      }
    }
    return { dailyFees, dailyRevenue, dailyVolume };
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyVolume };
};

const methodology = {
  Volume: "Total wager amount from all settled bets across Azuro V1, V2, and V3 contracts.",
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
      deadFrom: '2025-12-01',
    },
    [CHAIN.BASE]: {
      start: '2024-02-01',
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-06-01',
      deadFrom: '2023-12-23',
    },
    [CHAIN.LINEA]: {
      start: '2023-08-01',
      deadFrom: '2024-03-30',
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

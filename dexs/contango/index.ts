import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const chainConfig: Record<string, { duneName: string; start: string }> = {
  [CHAIN.ARBITRUM]: { duneName: "arbitrum", start: "2023-10-03" },
  [CHAIN.OPTIMISM]: { duneName: "optimism", start: "2023-10-02" },
  [CHAIN.ETHEREUM]: { duneName: "mainnet", start: "2023-10-03" },
  [CHAIN.POLYGON]: { duneName: "polygon", start: "2023-10-13" },
  [CHAIN.BASE]: { duneName: "base", start: "2023-10-09" },
  [CHAIN.XDAI]: { duneName: "gnosis", start: "2023-10-06" },
  [CHAIN.AVAX]: { duneName: "avalanche", start: "2024-08-11" },
  [CHAIN.LINEA]: { duneName: "linea", start: "2024-08-11" },
  [CHAIN.BSC]: { duneName: "bsc", start: "2024-06-07" },
  [CHAIN.SCROLL]: { duneName: "scroll", start: "2024-08-11" },
};

const duneChains = Object.values(chainConfig).map(({ duneName }) => duneName);
const duneChainsSql = duneChains.map((chain) => `'${chain}'`).join(", ");

const buildQuery = (fromTimestamp: number, toTimestamp: number) => `
  WITH volume AS (
    SELECT chain, SUM(ABS(QUANTITY_USD)) AS VOL_USD 
    FROM DUNE.CONTANGO_XYZ.RESULT_V2_ALL_TRADES
    WHERE TIMESTAMP >= from_unixtime(${fromTimestamp}) AND TIMESTAMP <= from_unixtime(${toTimestamp})
      AND chain IN (${duneChainsSql})
    GROUP BY chain
  ), 
  oi as (
    with LONG_OI_DELTA as (
      SELECT T.chain, DATE_TRUNC('day', T.TIMESTAMP) AS TIMESTAMP, T.BASE AS ASSET, SUM(T.QUANTITY) AS DELTA
      FROM DUNE.CONTANGO_XYZ.V2_TRANSACTIONS AS T
      WHERE T.chain IN (${duneChainsSql}) AND T.DIRECTION = 'Long'
      GROUP BY 1, 2, 3
    ),
    SHORT_OI_DELTA as (
      SELECT T.chain, DATE_TRUNC('day', T.TIMESTAMP) AS TIMESTAMP, T.BASE AS ASSET, SUM(T.QUANTITY) * -1 AS DELTA
      FROM DUNE.CONTANGO_XYZ.V2_TRANSACTIONS AS T
      WHERE T.chain IN (${duneChainsSql}) AND T.DIRECTION = 'Short'
      GROUP BY 1, 2, 3
    ), 
    OI_DELTA as (
      SELECT COALESCE(L.chain, S.chain) AS chain, COALESCE(L.TIMESTAMP, S.TIMESTAMP) AS TIMESTAMP, COALESCE(L.ASSET, S.ASSET) AS ASSET, COALESCE(L.DELTA, 0) + COALESCE(S.DELTA, 0) AS DELTA
      FROM LONG_OI_DELTA L
      LEFT JOIN SHORT_OI_DELTA S ON (S.TIMESTAMP = L.TIMESTAMP AND S.ASSET = L.ASSET AND S.chain = L.chain)
    ),
    ASSETS as (
      SELECT distinct chain, ASSET
      FROM OI_DELTA
    ),
    OI_DIRTY as (
      SELECT TS.TIMESTAMP AS TIMESTAMP, A.chain AS chain, A.ASSET AS ASSET, SUM(OI_DELTA.DELTA) OVER (PARTITION BY A.chain, A.ASSET ORDER BY TS.TIMESTAMP) AS OI
      FROM DUNE.CONTANGO_XYZ.RESULT_DAILY_TIMESTAMPS TS
      CROSS JOIN ASSETS A
      LEFT JOIN OI_DELTA ON OI_DELTA.TIMESTAMP = TS.TIMESTAMP AND OI_DELTA.ASSET = A.ASSET AND OI_DELTA.chain = A.chain
      WHERE TS.TIMESTAMP <= DATE_TRUNC('day', from_unixtime(${toTimestamp}))
    ),
    OI as (
      SELECT TIMESTAMP, chain, ASSET, 
      CASE
        WHEN OI < 0 THEN 0
        ELSE OI
      END AS OI
      FROM OI_DIRTY
    ), 
    PRICE_AS_OF as (
      SELECT ASSET, PRICE FROM (
        SELECT ASSET, PRICE, ROW_NUMBER() OVER (PARTITION BY ASSET ORDER BY TIMESTAMP DESC) AS RN
        FROM DUNE.CONTANGO_XYZ.RESULT_V2_DAILY_PRICES_USD
        WHERE TIMESTAMP <= DATE_TRUNC('day', from_unixtime(${toTimestamp}))
      ) WHERE RN = 1
    ),
    OI_USD as (
      SELECT OI.chain, OI.TIMESTAMP, OI.OI * PRICE.PRICE AS OI_USD
      FROM OI
      INNER JOIN PRICE_AS_OF AS PRICE ON PRICE.ASSET = OI.ASSET
    )
      SELECT OI.chain, TIMESERIES.TIMESTAMP AS TIMESTAMP, COALESCE(SUM(OI.OI_USD), 0) AS OI_USD
      FROM DUNE.CONTANGO_XYZ.RESULT_DAILY_TIMESTAMPS AS TIMESERIES
      LEFT JOIN OI_USD as OI ON OI.TIMESTAMP = TIMESERIES.TIMESTAMP
      WHERE TIMESERIES.TIMESTAMP > DATE_TRUNC('day', from_unixtime(${fromTimestamp})) AND TIMESERIES.TIMESTAMP <= DATE_TRUNC('day', from_unixtime(${toTimestamp}))
      GROUP BY 1, 2
  )
  SELECT volume.chain, volume.VOL_USD, oi.OI_USD
  FROM volume
  LEFT JOIN oi ON oi.chain = volume.chain
`;

const prefetch = async (options: FetchOptions) => {
  const { fromTimestamp, toTimestamp } = options;
  return queryDuneSql(options, buildQuery(fromTimestamp, toTimestamp));
};

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const duneChain = chainConfig[chain].duneName;
  const response = (options.preFetchedResults || []).filter((row: any) => row.chain === duneChain);

  return {
    dailyVolume: Number(response[0]?.VOL_USD ?? 0),
    openInterestAtEnd: Number(response[0]?.OI_USD ?? 0),
  };
};

const adapter: SimpleAdapter = {
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  prefetch,
  fetch,
  adapter: chainConfig,
};
export default adapter;

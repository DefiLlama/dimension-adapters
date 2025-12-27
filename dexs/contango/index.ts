import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const chainMap: Record<string, string> = {
  [CHAIN.ETHEREUM]: "mainnet",
  [CHAIN.XDAI]: "gnosis",
  [CHAIN.AVAX]: "avalanche",
  [CHAIN.BSC]: "bsc",
};

const fetch = async (_a: number, _: any, options: FetchOptions) => {
  const { chain, fromTimestamp, toTimestamp, createBalances } = options;
  const mappedChain = chainMap[chain] ?? chain
  const query = `
    WITH volume AS (
      SELECT SUM(ABS(QUANTITY_USD)) AS VOL_USD 
      FROM DUNE.CONTANGO_XYZ.RESULT_V2_ALL_TRADES
      WHERE TIMESTAMP >= from_unixtime(${fromTimestamp}) AND TIMESTAMP <= from_unixtime(${toTimestamp}) AND chain = '${mappedChain}'
    ), 
    oi as (
      with LONG_OI_DELTA as (
        SELECT DATE_TRUNC('day', T.TIMESTAMP) AS TIMESTAMP, T.BASE AS ASSET, SUM(T.QUANTITY) AS DELTA
        FROM DUNE.CONTANGO_XYZ.V2_TRANSACTIONS AS T
        WHERE T.chain = '${mappedChain}' AND T.DIRECTION = 'Long'
        GROUP BY 1, 2
      ),
      SHORT_OI_DELTA as (
        SELECT DATE_TRUNC('day', T.TIMESTAMP) AS TIMESTAMP, T.BASE AS ASSET, SUM(T.QUANTITY) * -1 AS DELTA
        FROM DUNE.CONTANGO_XYZ.V2_TRANSACTIONS AS T
        WHERE T.chain = '${mappedChain}' AND T.DIRECTION = 'Short'
        GROUP BY 1, 2
    ), 
    OI_DELTA as (
      SELECT COALESCE(L.TIMESTAMP, S.TIMESTAMP) AS TIMESTAMP, COALESCE(L.ASSET, S.ASSET) AS ASSET, COALESCE(L.DELTA, 0) + COALESCE(S.DELTA, 0) AS DELTA
      FROM LONG_OI_DELTA L
      LEFT JOIN SHORT_OI_DELTA S ON (S.TIMESTAMP = L.TIMESTAMP AND S.ASSET = L.ASSET)
    ),
    ASSETS as (
      SELECT distinct ASSET
      FROM OI_DELTA
    ),
    OI_DIRTY as (
      SELECT TS.TIMESTAMP AS TIMESTAMP, A.ASSET AS ASSET, SUM(OI_DELTA.DELTA) OVER (PARTITION BY A.ASSET ORDER BY TS.TIMESTAMP) AS OI
      FROM DUNE.CONTANGO_XYZ.RESULT_DAILY_TIMESTAMPS TS
      CROSS JOIN ASSETS A
      LEFT JOIN OI_DELTA ON OI_DELTA.TIMESTAMP = TS.TIMESTAMP AND OI_DELTA.ASSET = A.ASSET
      WHERE TS.TIMESTAMP <= DATE_TRUNC('day', from_unixtime(${toTimestamp}))
    ),
    OI as (
      SELECT TIMESTAMP, ASSET, 
      CASE
        WHEN OI < 0 THEN 0
        ELSE OI
      END AS OI
      FROM OI_DIRTY
    ), 
    OI_USD as (
      SELECT OI.TIMESTAMP, OI.OI * PRICE.PRICE AS OI_USD
      FROM OI
      INNER JOIN DUNE.CONTANGO_XYZ.RESULT_V2_DAILY_PRICES_USD AS PRICE 
      ON (PRICE.ASSET = OI.ASSET AND PRICE.TIMESTAMP = OI.TIMESTAMP)
    )
      SELECT '${mappedChain}' AS chain, TIMESERIES.TIMESTAMP AS TIMESTAMP, COALESCE(SUM(OI.OI_USD), 0) AS OI_USD
      FROM DUNE.CONTANGO_XYZ.RESULT_DAILY_TIMESTAMPS AS TIMESERIES
      LEFT JOIN OI_USD as OI ON OI.TIMESTAMP = TIMESERIES.TIMESTAMP
      WHERE TIMESERIES.TIMESTAMP > DATE_TRUNC('day', from_unixtime(${fromTimestamp})) AND TIMESERIES.TIMESTAMP <= DATE_TRUNC('day', from_unixtime(${toTimestamp}))
      GROUP BY 1, 2
    )
    SELECT volume.VOL_USD, oi.OI_USD, oi.TIMESTAMP
    FROM volume CROSS JOIN oi
  `;

  const response = await queryDuneSql(options, query);

  if (!response[0] || !response[0].VOL_USD || !response[0].OI_USD) {
    throw Error(`Failed to query data from Dune for ${options.startOfDay}`)
  }

  return {
    dailyVolume: Number(response[0].VOL_USD),
    openInterestAtEnd: Number(response[0].VOL_USD),
  };
};

const adapter: SimpleAdapter = {
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2023-10-03",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2023-10-02",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-10-03",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2023-10-13",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2023-10-09",
    },
    [CHAIN.XDAI]: {
      fetch,
      start: "2023-10-06",
    },
    [CHAIN.AVAX]: {
      fetch,
      start: "2024-08-11",
    },
    [CHAIN.LINEA]: {
      fetch,
      start: "2024-08-11",
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2024-06-07",
    },
    [CHAIN.SCROLL]: {
      fetch,
      start: "2024-08-11",
    },
  },
};
export default adapter;

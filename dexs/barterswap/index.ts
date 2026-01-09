import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const ETHEREUM = CHAIN.ETHEREUM;
const DUNE_QUERY_ID = "6493443";
/*
Dune Query Link: https://dune.com/queries/6493443
This query fetches daily volume and fees data for BarterSwap by aggregating swap transactions from their smart contracts on Ethereum.

Query SQL:

WITH executors_trades AS (
  SELECT
    DATE_TRUNC('day', t.block_time) AS date,
    t.tx_hash,
    MAX(t.amount_usd) AS value_usd
  FROM tokens_ethereum.transfers AS t
  WHERE
    t.block_time >= TRY_CAST('2023-01-01 00:00' AS TIMESTAMP)
    AND (
      t."from" = 0x2141af658ffda533da864dd11b2ffdb8529c8b94
      OR t."from" = 0x2c0552e5dcb79b064fd23e358a86810bc5994244
      OR t."from" = 0xb2f72662ed42067ccce278f8462a0215b6adcabb
    )
    AND NOT t.tx_hash IN (
      SELECT
        tx_hash
      FROM cow_protocol_ethereum.batches
    )
  GROUP BY
    1, 2
), cow_trades AS (
  SELECT
    DATE_TRUNC('day', t.block_time) AS date,
    c.sell_value_usd AS value_usd
  FROM ethereum.transactions AS t
  RIGHT JOIN cow_protocol_ethereum.trades AS c
    ON t.hash = c.tx_hash
  WHERE
    t."to" = 0x9008D19f58AAbD9eD0D60971565AA8510560ab41
    AND (
      t."from" = 0xc7899ff6a3ac2ff59261bd960a8c880df06e1041
      OR t."from" = 0xbf54079c9bc879ae4dd6bc79bce11d3988fd9c2b
    )
)
SELECT
  COALESCE(e.date, c.date) AS date,
  COALESCE(SUM(e.value_usd), 0) + COALESCE(SUM(c.value_usd), 0) AS volume_usd,
  0 AS fees_usd
FROM executors_trades AS e
FULL OUTER JOIN cow_trades AS c
  ON e.date = c.date
GROUP BY
  1
ORDER BY
  1 DESC
*/

interface DuneResult {
  result: {
    rows: Array<{
      date: string;
      volume_usd: number;
      fees_usd: number;
    }>;
  };
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateString = new Date(dayTimestamp * 1000).toISOString().split('T')[0];

  const DUNE_API_KEY = process.env.DUNE_API_KEY;
  if (!DUNE_API_KEY) {
    console.log('⚠️  DUNE_API_KEY not set in environment variables');
    return {
      timestamp: dayTimestamp,
      dailyVolume: "0",
    };
  }

  try {
    const url = `https://api.dune.com/api/v1/query/${DUNE_QUERY_ID}/results`;
    const response = await fetchURL(url + `?api_key=${DUNE_API_KEY}`);
    const data = response as DuneResult;

    const dayData = data.result.rows.find((row) => row.date.startsWith(dateString));

    if (!dayData) {
      console.log(`No data found for ${dateString}`);
      return {
        timestamp: dayTimestamp,
        dailyVolume: "0",
      };
    }

    console.log(`Date: ${dateString}`);
    console.log(`Volume: $${dayData.volume_usd.toFixed(2)}`);

    return {
      timestamp: dayTimestamp,
      dailyVolume: dayData.volume_usd.toString(),
    };
  } catch (error) {
    console.error("Error fetching from Dune:", error);
    return {
      timestamp: dayTimestamp,
      dailyVolume: "0",
    };
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [ETHEREUM]: {
      fetch,
      start: 1672531200,
    },
  },
};

export default adapter;
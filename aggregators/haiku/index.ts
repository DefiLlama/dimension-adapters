import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { HaikuAddreses } from "../../helpers/aggregators/haiku";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const sql_query = `
    WITH tx_volumes AS (
  SELECT 
    tx.hash AS tx_hash,
    date_trunc('day', tx.block_time) AS day,

    GREATEST(
      SUM(CASE WHEN tx."from" = tokenstf."from" THEN tokenstf.amount * price.price ELSE 0 END),
      SUM(CASE WHEN tx."from" = tokenstf."to" THEN tokenstf.amount * price.price ELSE 0 END)
    ) AS tx_volume

  FROM ${options.chain.toLowerCase()}.transactions tx

  LEFT JOIN tokens.transfers tokenstf
    ON tx.hash = tokenstf.tx_hash
    AND tokenstf.blockchain = '${options.chain.toLowerCase()}'

  LEFT JOIN prices.minute price
    ON price.blockchain = '${options.chain.toLowerCase()}'
    AND price.contract_address = tokenstf.contract_address
    AND price.timestamp = date_add(
      'minute',
      CAST(floor(minute(tx.block_time) / 15) * 15 AS integer),
      date_trunc('hour', tx.block_time)
    )

  WHERE tx.to = 0x24aC999FF132B32c5b3956973b6213B0d07eB2C7
    AND (
      tx."from" = tokenstf."from" OR tx."from" = tokenstf."to"
    )
    AND CAST(tx.data AS varchar) LIKE '0xa1de4537%'
    AND tx.block_time >= from_unixtime(${options.startTimestamp})
    AND tx.block_time < from_unixtime(${options.endTimestamp})

  GROUP BY tx.hash, date_trunc('day', tx.block_time)
)

SELECT 
  day,
  SUM(tx_volume) AS volume
FROM tx_volumes
GROUP BY day
ORDER BY day DESC
LIMIT 1
  `;
  const result = await queryDuneSql(options, sql_query);
  if (result.length > 0) {
    dailyVolume.addCGToken("tether", result[0].volume);
  }
  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(HaikuAddreses).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: HaikuAddreses[chain].startTime,
      },
    };
  }, {}),
};

export default adapter;

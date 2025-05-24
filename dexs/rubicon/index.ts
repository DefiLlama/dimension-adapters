import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const results = await queryDuneSql(
    options,
    `
      WITH filltxs AS (
        SELECT
          tx_hash,
          topic3
        FROM evms.logs
        WHERE
          blockchain = 'optimism'
          AND tx_to = 0x95b7f3662ba73b3ff35874af0e09b050db03118b
          AND topic0 = 0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66
      ), transfers AS (
        SELECT
          tokens.transfers.tx_hash, SUM(tokens.transfers.amount) as volume, tokens.transfers.contract_address
        FROM tokens.transfers, filltxs
        WHERE
          tokens.transfers.tx_hash IN (filltxs.tx_hash)
          AND blockchain = 'optimism' 
          AND "from" = 0x95b7f3662ba73b3ff35874af0e09b050db03118b
          AND lower(cast(tokens.transfers."to" as varchar)) = lower('0x' || substr(cast(filltxs.topic3 as varchar), 27))
        GROUP BY tokens.transfers.contract_address
      )
      SELECT
        *
      FROM transfers`
  )
  if (results && results.length > 0) {
    results.forEach(row => {
      dailyVolume.add(row.contract_address, row.volume);
    });
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
      [CHAIN.OPTIMISM]: {
          fetch: fetch as any,
          }
      },
}

export default adapter;
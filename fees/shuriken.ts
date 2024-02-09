import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const transfer_txs = await queryIndexer(`
      SELECT
          block_time,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
      FROM
          ethereum.event_logs
      WHERE
          block_number > 18332267
          AND contract_address IN (
              SELECT DISTINCT address
              FROM ethereum.traces
              WHERE
                  block_number > 18332267
                  AND from_address IN ('\\x28B108B9932dD9E26103b9d3ed1999d3087F537d')
                  AND "type" = 'create'
          )
          AND topic_0 = '\\x9377d2ca0fa4b8097cf0c9128e900f40fc24811a43eefb75da59072dbbcc8c85'
          AND block_time BETWEEN llama_replace_date_range;
          `, options);

  transfer_txs.map((e: any) => {
    const amount = Number('0x' + e.data.slice((5 * 64), (5 * 64) + 64))
    dailyFees.addGasToken(amount);
  })

  return { dailyFees, dailyRevenue: dailyFees, timestamp }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: 1697155200,
    },
  },
};

export default adapter;

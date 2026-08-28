import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const chainMapping: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'Ethereum',
  [CHAIN.SOLANA]: 'Solana',
  [CHAIN.BSC]: 'BSC',
};

interface VolumeRow {
  blockchain: string;
  total_volume: number;
}

const prefetch = async (options: FetchOptions) => {
  const now = Date.now();
  const tenHoursAgo = now - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  return queryDuneSql(options, `
    WITH trades AS (
      SELECT
        'Ethereum' AS blockchain,
        amount_usd
      FROM pepeboost_ethereum.bot_trades
      WHERE is_last_trade_in_transaction = true
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})

      UNION ALL

      SELECT
        'BSC' AS blockchain,
        amount_usd
      FROM query_4945136 -- pepeboost_bnb.bot_trades
      WHERE isLastTradeInTransaction = true
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})

      UNION ALL

      SELECT
        'Solana' AS blockchain,
        amount_usd
      FROM pepe_boost_solana.bot_trades
      WHERE is_last_trade_in_transaction = true
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
      blockchain,
      COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM trades
    GROUP BY blockchain
  `);
};

const fetch = async (options: FetchOptions) => {
  const blockchain = chainMapping[options.chain];
  const result = (options.preFetchedResults || []) as VolumeRow[];
  const chainVolume = result.find((row) => row.blockchain === blockchain)?.total_volume || 0;

  return { dailyVolume: chainVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  prefetch,
  fetch,
  methodology: {
    Volume: 'Total USD trading volume of swaps routed through PepeBoost bot.',
  },
  chains: [CHAIN.ETHEREUM, CHAIN.SOLANA, CHAIN.BSC],
  start: '2024-01-06',
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;

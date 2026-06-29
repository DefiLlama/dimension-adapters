import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const chainMapping: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'Ethereum',
  [CHAIN.SOLANA]: 'Solana',
  [CHAIN.BSC]: 'BSC',
};

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const now = Date.now();
  const tenHoursAgo = now - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const blockchain = chainMapping[options.chain];

  const result = await queryDuneSql(options, `
    SELECT COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM query_3105682
    WHERE isLastTradeInTransaction = true
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND blockchain = '${blockchain}'
  `);

  return { dailyVolume: result[0].total_volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
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

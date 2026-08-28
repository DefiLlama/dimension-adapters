import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const fetch: any = async (options: FetchOptions) => {
  const now = Date.now();
  const tenHoursAgo = now - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const result = await queryDuneSql(options, `
    SELECT COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM bonkbot_solana.bot_trades
    WHERE is_last_trade_in_transaction = true
      AND TIME_RANGE
  `);

  return { dailyVolume: result[0].total_volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-08-23',
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology: {
    Volume: 'Total USD trading volume of swaps routed through BonkBot.',
  },
};

export default adapter;

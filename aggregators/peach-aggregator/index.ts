import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { aggregatorStart, getPeachAmounts } from '../../helpers/peach';

export const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const row of await getPeachAmounts(options, 'aggregator')) {
    dailyVolume.addUSDValue(Number(row.volume_usd));
  }
  return { dailyVolume };
};

// Each confirmed router fill is counted once; route hops are not added again.
// Aggregator fees are not measured by this endpoint and are not exported.
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ARC],
  start: aggregatorStart,
  fetch,
  methodology: {
    Volume: 'USD value of swaps routed through the Peach aggregator, taking the larger side of input/output value per trade. Each fill is counted once; multi-hop swaps are not double-counted. Swaps without a USD price are excluded.',
  },
};

export default adapter;

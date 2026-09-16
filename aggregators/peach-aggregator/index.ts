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
    Volume: 'Persisted backend USD value of each successful router ConfirmedSwapEvent, shared with the Peach dashboard. Takes the larger priced input/output side using PDS at first successful projection; price timestamps are retained. Historical replay uses a projection-time snapshot, not historical oracle prices. Each fill is counted once; StepSwapEvent hops are excluded. Records without a USD valuation are excluded.',
  },
};

export default adapter;

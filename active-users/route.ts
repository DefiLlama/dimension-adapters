import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { arcExecuted, fetchRouteSwaps } from '../aggregators/route';

// Same swaps as aggregators/route: one per completed trade through any Route settlement generation,
// counted by transaction. Unlike volume, swaps of the volume-excluded wallet are counted.
// https://arcscan.app/address/0x33C65bA72B023BF6B207D7B62275630cA433AFB8
const arcExecutor = '0x33c65ba72b023bf6b207d7b62275630ca433afb8';

const fetch = async (options: FetchOptions) => {
  // SDK log ranges are inclusive; adjacent hourly pulls share their boundary block.
  const toBlock = (await options.getToBlock()) - 1;
  if (options.chain === CHAIN.ARC) {
    const logs = await options.getLogs({ toBlock, target: arcExecutor, eventAbi: arcExecuted, onlyArgs: false });
    return { dailyTransactionsCount: new Set(logs.map((log: any) => log.transactionHash.toLowerCase())).size };
  }
  const { swapTxs } = await fetchRouteSwaps(options, toBlock);
  return { dailyTransactionsCount: swapTxs.size };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: '2026-09-05' },
    [CHAIN.ARC]: { start: '2026-09-15' },
  },
  methodology: {
    TransactionsCount: 'Transactions containing a completed Route swap (original engines, fee collectors, provider and builder executors, the Route v2 executors and RouteEntry, plus the Arc executor), counted once per transaction; quotes, pool hops and RouteEntry vault zaps are not counted.',
  },
};

export default adapter;

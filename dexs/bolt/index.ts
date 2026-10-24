import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryEvents } from '../../helpers/sui';

// Bolt is an oracle-priced (prop) AMM: each pool holds one base asset and quotes it against a quote asset.
// The swap event moved to SwapExecutedV2 in the 2026-02-20 upgrade; both carry the same fields.
const SWAP_EVENTS = [
  '0xc8724de692400a2a08585f6f7c8617acfb783abe2c66ae6a4680a21b36a504c5::pool::SwapExecuted',
  '0x0c6b6b0ec858d76381f7f5f787eb8cd6479d65df24ca6f726e9ae246d4ace339::pool::SwapExecutedV2',
];

// pool id -> [base, quote], matching the event's <Base, Quote> type parameters
const POOLS: Record<string, [string, string]> = {
  '0x21167b2e981e2c0a693afcfe882a3a827d663118e19afcb92e45bfe43fe56278': [ADDRESSES.sui.SUI, ADDRESSES.sui.USDC_CIRCLE],
  '0x34fcaa553f1185e1c3a05de37b6a4d10c39535d19f9c8581eeae826434602b58': [ADDRESSES.sui.USDC_CIRCLE, ADDRESSES.sui.SUI],
};

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  for (const eventType of SWAP_EVENTS) {
    const events = await queryEvents({ eventType, options });
    for (const swap of events) {
      const pool = POOLS[swap.pool_id];
      if (!pool) continue;
      // is_buy: trader pays the quote asset and receives the base asset
      const [base, quote] = pool;
      dailyVolume.add(swap.is_buy ? quote : base, swap.amount_in);
    }
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: '2025-11-06',
  pullHourly: true,
  methodology: {
    Volume: 'Sum of the input amount of every swap on Bolt pools, valued at the input asset price.',
  },
};

export default adapter;

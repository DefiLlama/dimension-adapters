import { SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getOpenInterest } from '../helpers/uxuy-perps';

const adapter: SimpleAdapter = {
  version: 2,
  // OI is a stock: the hourly flow aggregator would incorrectly sum 24 snapshots.
  pullHourly: false,
  chains: [CHAIN.OFF_CHAIN],
  // First published hourly snapshot: 2026-10-26 12:00 UTC; no earlier history is backfilled.
  start: '2026-10-26',
  fetch: getOpenInterest,
  methodology: {
    OpenInterest: 'Total absolute position value, equal to long plus short USD value, from the published snapshot for the period-end UTC hour. Collection starts on the hour and completes later; this is an hourly observation. Missing hours are not replaced with stale latest values.',
  },
};

export default adapter;

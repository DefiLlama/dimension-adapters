import { SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { fetchVolume } from '../helpers/faze';

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ARC],
  start: '2026-09-13',
  fetch: fetchVolume,
  methodology: { Volume: 'Gross quote amount traded on FAZE release 9 bonding curves, counting one side of each buy or sell. Excludes post-graduation Uniswap volume and deployments before release 9.' },
};
export default adapter;

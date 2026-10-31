import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getMetrics } from '../helpers/uxuy-perps';
import BigNumber from 'bignumber.js';

const fetch = async (options: FetchOptions) => {
  const data = await getMetrics(options);
  const dailyVolume = options.createBalances();
  // The SDK expects decimal USD amounts as numbers, after source precision checks in getMetrics.
  dailyVolume.addUSDValue(new BigNumber(data.volume_usd).toNumber());
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.OFF_CHAIN],
  fetch,
  methodology: {
    Volume: 'Executed-order notional (executed price times executed quantity) on UXUY self-operated perps, attributed by order update time. USDT and UUSD use the venue\'s 1:1 USD accounting convention. Replaces the discontinued Hyperliquid builder source; builder activity is not included.',
  },
};

export default adapter;

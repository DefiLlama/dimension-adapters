import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getUniV2LogAdapter } from '../helpers/uniswap';

const factories: { [key: string]: string } = {
  [CHAIN.ABSTRACT]: '0x566d7510dEE58360a64C9827257cF6D0Dc43985E',
  [CHAIN.INK]: '0xfe57A6BA1951F69aE2Ed4abe23e0f095DF500C04',
  // [CHAIN.ZERO]: '0x1B4427e212475B12e62f0f142b8AfEf3BC18B559',
};

const feeConfigs = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
};

async function fetch(options: FetchOptions) {
  if (!factories[options.chain]) {
    return {
      dailyVolume: 0,
      dailyFees: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailySupplySideRevenue: 0,
      dailyHoldersRevenue: 0,
    };
  }
  const adapter = getUniV2LogAdapter({
    factory: factories[options.chain],
    ...feeConfigs,
  });
  const response = await adapter(options);
  return response;
}

const methodology = {
  Fees: 'Swap fees from paid by users.',
  UserFees: 'User pays fees on each swap.',
  Revenue: 'Protocol have no revenue.',
  ProtocolRevenue: 'Protocol have no revenue.',
  SupplySideRevenue: 'All user fees are distributed among LPs.',
  HoldersRevenue: 'Holders have no revenue.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ABSTRACT]: { start: '2025-01-07' },
    [CHAIN.INK]: { start: '2025-01-07' },
    [CHAIN.ZERO]: { start: '2025-01-07' },
  },
  methodology,
};

export default adapter;

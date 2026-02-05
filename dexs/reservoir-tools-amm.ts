import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getUniV2LogAdapter } from '../helpers/uniswap';

const factories: { [key: string]: { address: string, start: string } } = {
  [CHAIN.ABSTRACT]: {
    address: '0x566d7510dEE58360a64C9827257cF6D0Dc43985E',
    start: '2025-01-07',
  },
  [CHAIN.INK]: {
    address: '0xfe57A6BA1951F69aE2Ed4abe23e0f095DF500C04',
    start: '2025-01-07',
  },
  [CHAIN.ZERO]: {
    address: '0x1B4427e212475B12e62f0f142b8AfEf3BC18B559',
    start: '2025-01-07',
  },
};

const feeConfigs = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
};

async function fetch(options: FetchOptions) {
  const adapter = getUniV2LogAdapter({
    factory: factories[options.chain].address,
    ...feeConfigs,
  });
  const response = await adapter(options);
  return response;
}

const methodology = {
  Fees: 'Swap fees paid by users on each trade.',
  UserFees: 'User pays fees on each swap.',
  Revenue: 'Protocol has no revenue.',
  ProtocolRevenue: 'Protocol has no revenue.',
  SupplySideRevenue: 'All user fees are distributed among LPs.',
  HoldersRevenue: 'Holders have no revenue.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: factories,
  methodology,
};

export default adapter;

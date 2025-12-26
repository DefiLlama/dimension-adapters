import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getUniV3LogAdapter } from '../helpers/uniswap';

const factories: { [key: string]: string } = {
  [CHAIN.ABSTRACT]: '0xA1160e73B63F322ae88cC2d8E700833e71D0b2a1',
  [CHAIN.INK]: '0x640887A9ba3A9C53Ed27D0F7e8246A4F933f3424',
  // [CHAIN.ZERO]: '0xA1160e73B63F322ae88cC2d8E700833e71D0b2a1',
};

const feeConfigs = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
};

async function fetch(options: FetchOptions) {
  if (options.chain === CHAIN.ZERO) {
    return {
      dailyVolume: 0,
      dailyFees: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailySupplySideRevenue: 0,
      dailyHoldersRevenue: 0,
    };
  }
  const adapter = getUniV3LogAdapter({
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
    [CHAIN.ZERO]: { start: '2025-12-21' },
    [CHAIN.INK]: { start: '2025-01-07' },
  },
  methodology,
};

export default adapter;

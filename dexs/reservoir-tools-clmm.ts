import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getUniV3LogAdapter } from '../helpers/uniswap';

const factories: { [key: string]: { address: string, start: string } } = {
  [CHAIN.ABSTRACT]: {
    address: '0xA1160e73B63F322ae88cC2d8E700833e71D0b2a1',
    start: '2025-01-07',
  },
  [CHAIN.INK]: {
    address: '0x640887A9ba3A9C53Ed27D0F7e8246A4F933f3424',
    start: '2025-01-07'
  },
  [CHAIN.ZERO]: {
    address: '0xA1160e73B63F322ae88cC2d8E700833e71D0b2a1',
    start: '2025-12-21'
  },
};

const feeConfigs = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
};

async function fetch(options: FetchOptions) {
  const adapter = getUniV3LogAdapter({
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

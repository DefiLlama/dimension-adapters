import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addTokensReceived } from '../helpers/token';

const chainConfig: { [chain: string]: { treasury: string, start: string } } = {
  [CHAIN.ARBITRUM]: {
    treasury: '0x764E7f8798D8193bEd69030AE66eb304968C3F93',
    start: '2023-02-19',
  },
};

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];

  const dailyFees = await addTokensReceived({
    options,
    target: config.treasury,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: 'trading fees paid by users',
  Revenue: 'trading fee collected by protocol.',
  ProtocolRevenue: 'fee inflows in treasury address.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;

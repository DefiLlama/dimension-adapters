import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addTokensReceived } from '../helpers/token';
import { METRIC } from '../helpers/metrics';

const chainConfig: { [chain: string]: { treasury: string, start: string } } = {
  [CHAIN.ARBITRUM]: {
    treasury: '0x764E7f8798D8193bEd69030AE66eb304968C3F93',
    start: '2023-02-19',
  },
};

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  const { createBalances } = options;

  const rawFees = await addTokensReceived({
    options,
    target: config.treasury,
  });

  const dailyFees = createBalances();
  dailyFees.addBalances(rawFees, METRIC.TRADING_FEES);

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

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Trading fees paid by users on perpetual and futures contracts',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'Trading fees collected by the protocol treasury',
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: 'Trading fees deposited into the protocol treasury address',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;

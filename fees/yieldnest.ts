import { CHAIN } from '../helpers/chains';
import type { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import { addTokensReceived, getETHReceived } from '../helpers/token';

const feeCollectors = '0xC92Dd1837EBcb0365eB0a8795f9c8E474f8B6183';

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();

  await addTokensReceived({ options, target: feeCollectors, balances: dailyFees });
  await getETHReceived({ options, target: feeCollectors, balances: dailyFees });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: 'Amount of fees collected by YieldNest.',
  Revenue: 'Amount of fees collected by YieldNest.',
  ProtocolRevenue: 'Amount of fees collected by YieldNest.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.BSC],
  start: '2025-05-02',
  methodology,
};

export default adapter;

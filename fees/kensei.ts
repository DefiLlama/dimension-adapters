import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getETHReceived } from '../helpers/token';

const FEE_WALLETS = [
  '0x79e298e86ddcca138fccc4687d0a4168a6f2dce6',
];

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = await getETHReceived({ options, targets: FEE_WALLETS });
  
  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.KATANA],
  dependencies: [Dependencies.ALLIUM],
  start: '2025-10-16',
  methodology: {
    Fees: 'Tokens launching fees paid by users.',
    Revenue: 'Tokens launching fees paid by users.',
    ProtocolRevenue: 'Tokens launching fees paid by users.',
  },
};

export default adapter;

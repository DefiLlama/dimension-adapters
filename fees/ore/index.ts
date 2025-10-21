import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getSolanaReceived } from '../../helpers/token';

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  await getSolanaReceived({ options, balances: dailyFees, target: '45db2FSR4mcXdSVVZbKbwojU6uYDpMyhpEi7cC8nHaWG' })

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-10-19',
  methodology: {
    Fees: 'Count ORE tokens collected from 10% of total SOL deployed on ORE boards by protocol wallet 45db2FSR4mcXdSVVZbKbwojU6uYDpMyhpEi7cC8nHaWG.',
    Revenue: 'All ORE fees are revenue.',
    ProtocolRevenue: 'All ORE fees are revenue collected by protocol.',
  },
};

export default adapter;

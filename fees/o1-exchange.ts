import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getSolanaReceived } from '../helpers/token';

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const targets = [
    'FUzZ2SPwLPAKaHubxQzRsk9K8dXb4YBMR6hTrYEMFFZc',
    'HG73jy6opRQwgTaynUeT6MxX6h3mshNWLPGHme4HdiYy'
  ];

  const dailyFees = await getSolanaReceived({
    blacklists: targets,
    options,
    targets,
  });

  return { dailyFees, dailyUserFees: dailyFees, dailyHoldersRevenue: 0 }; 
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-07-01',
  methodology: {
    Fees: 'User pays 0.5%-1% fee on each trade',
    UserFees: 'User pays 0.5%-1% fee on each trade',
    HoldersRevenue: 'No token holder revenue',
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
};

export default adapter;

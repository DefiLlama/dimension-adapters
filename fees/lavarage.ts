import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getSolanaReceived } from '../helpers/token';

// https://dune.com/adam_tehc/axiom
const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const targets = [
    '6JfTobDvwuwZxZP6FR5JPmjdvQ4h4MovkEVH2FPsMSrF',
  ];

  const partnerAddresses = [
    '8iMq4uShCbj4HAGKrHHd9EY4SmYor2y1XRP7Fh21BwHJ',
  ];

  const blacklists: Array<string> = [
    '2LUYq7EyjHCgVjv9tnE2AcYQcrjnEeD22hQdWN4S6y7W',
    'BFeh7vYjH9TDLUzosbCKfQQgxDW4eQzVezw8FFbmM7mt',
  ];

  const dailyRevenue = await getSolanaReceived({
    blacklists: targets.concat(blacklists),
    options,
    targets,
    blacklist_signers: targets.concat(blacklists),
  });

  const dailyFees = await getSolanaReceived({
    blacklists: partnerAddresses.concat(blacklists).concat(targets),
    options,
    targets: partnerAddresses.concat(targets),
    blacklist_signers: partnerAddresses.concat(blacklists).concat(targets),
  });

  return { dailyFees, dailyUserFees: dailyFees, dailyHoldersRevenue: 0, dailyRevenue: dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  start: '2024-03-20',
  methodology: {
    Fees: 'User pays 0.5%-1% fee on each trade. Lender pays 30% of the interest they receive.',
    Revenue: 'Partners receive up to 75% of the trading fees, so revenue is lower than fees.',
    UserFees: 'User pays 0.5%-1% fee on each trade',
    HoldersRevenue: 'No token holder revenue',
    ProtocolRevenue: 'Partners receive up to 75% of the trading fees, so revenue is lower than fees',
  },
  isExpensiveAdapter: true,
};

export default adapter;

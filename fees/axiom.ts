import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getSolanaReceived } from '../helpers/token';

const fetch: any = async (options: FetchOptions) => {
  const targets = [
    '7LCZckF6XXGQ1hDY6HFXBKWAtiUgL9QY5vj1C4Bn1Qjj',
    '4V65jvcDG9DSQioUVqVPiUcUY9v6sb6HKtMnsxSKEz5S',
    'CeA3sPZfWWToFEBmw5n1Y93tnV66Vmp8LacLzsVprgxZ',
    'AaG6of1gbj1pbDumvbSiTuJhRCRkkUNaWVxijSbWvTJW',
  ];

  const dailyFees = await getSolanaReceived({
    blacklists: targets,
    options,
    targets,
  });
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;

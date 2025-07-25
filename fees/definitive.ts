import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../helpers/token";

// https://metabase.definitive.fi/public/dashboard/80e43551-a7e9-4503-8ac5-d5697a4a3734?tab=17-revenue
const FeeAdresses: Record<string, string[]> = {
  [CHAIN.ARBITRUM]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643"
  ],
  [CHAIN.AVAX]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
  ],
  [CHAIN.BASE]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
  ],
  [CHAIN.ETHEREUM]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643"
  ],
  [CHAIN.OPTIMISM]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
  ],
  [CHAIN.POLYGON]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
  ],
  [CHAIN.SOLANA]: [
    "Ggp9SGTqAKiJWRXeyEb2gEVdmD6n7fgHD7t4s8DrAqwf",
  ],
  [CHAIN.HYPERLIQUID]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
  ],
  [CHAIN.BSC]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
  ],
  [CHAIN.BLAST]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
  ],
}

const fetch = async (options: FetchOptions) => {
  const vaults = FeeAdresses[options.chain];
  if (!vaults.length) return { dailyFees: 0, dailyRevenue: 0, dailyProtocolRevenue: 0 };

  let dailyFees;
  if (options.chain === CHAIN.SOLANA) {
    dailyFees = await getSolanaReceived({
      options,
      targets: vaults,
    });
  } else {
    dailyFees = await getETHReceived({
      options,
      targets: vaults,
    });
  }
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: 'User pays 0.05% - 0.25% fee on each trade',
  Revenue: 'Fees are distributed to Definitive',
  ProtocolRevenue: 'Fees are distributed to Definitive',
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
    // [CHAIN.HYPERLIQUID]: {
    //   fetch,
    //   start: '2022-01-01',
    //   meta: { methodology }
    // },
    [CHAIN.BSC]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
    // [CHAIN.BLAST]: {
    //   fetch,
    //   start: '2022-01-01',
    //   meta: { methodology }
    // },
    [CHAIN.SOLANA]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
  },
};

export default adapter;

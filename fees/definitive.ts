import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived, getSolanaReceived, addTokensReceived } from "../helpers/token";

// https://metabase.definitive.fi/public/dashboard/80e43551-a7e9-4503-8ac5-d5697a4a3734?tab=17-revenue

// Production Solana performers
const PRODUCTION_SOLANA_PERFORMERS = [
  "GEe8eQ1cBH8cXX2Nba4xFhKMpH9KxSre3c3uMVD5yXRJ",
  "5Dr7kc6U9hrwv1PQz67nyvhUpvXdQibt6L8RHwUrt2L4",
  "9XLonXfbZqBp66WRDScfRp1MJYKd4k4tUDibMQBLJehJ",
  "2Rf9qzW9rhCnJmEbErrHDDZfeEXtemYdLkyJ1TE12pa7",
  "A1GC8eqyezWb5gbgaLxzg93LgP84SXhLZymmv7g4t87a",
];

// Production user op sender
const PRODUCTION_USER_OP_SENDER = "0x5712F863D5898bA78041f58e34e190549Cb4B813";

// Performer groups by chain
const performerGroups = [
  {
    performers: [
      "0x25378b4200e3BD002b696b10A4F5E2e5B5786CDD",
      "0xb60Afc036E86cB7FdFd5Db7268df3527e2113933",
      "0xEf586A266036c3D25591fFc4470D82AB8Dd14FF9",
      "0x7470A213536B7Fb86a84e31C148eF11a1dd3cA52",
      "0x1ad2dF0E33378c5c6479A92990a6c2c005Bf3B60",
      "0x4f8fc8031e35ea47bea0ff7466f5fc702fa84a63",
      "0xd056C0eEE354b24fE7c5d4Ee762C4D7574bAdaC1",
    ],
    chains: [CHAIN.ARBITRUM, CHAIN.AVAX, CHAIN.BASE, CHAIN.ETHEREUM],
  },
  {
    performers: [
      "0x5112E3E5313390F4650B90D41B21EeA765A30d18",
      "0x92004197237048f5238a92D51fe79daa5Ba01438",
      "0xC41ac1C5b65e6F9Dec199ff05fA5E147EF8124D7",
      "0x3ac570Dd79d5df75758868DB81D205d0570F2274",
      "0x3837DfbF8441337443A3f9AF3B616C1602a6043E",
      "0x86f7c659B2e5f6E6Ca7B0Ca0FECE91a722a92063",
      "0x91049748571AC21e6114C55D23f24e99387E03Cf",
      "0xAa521d3615886FEB6100D3AFCAa98d2B52947AFA",
      "0x11De4E2cBa0a13ca7fC73244F8Ec21474e33E521",
      "0x3B0a94b5de7dD5660c600286B4fE8937f04c9D26",
    ],
    chains: [CHAIN.BASE],
  },
  {
    performers: [
      "0xd056C0eEE354b24fE7c5d4Ee762C4D7574bAdaC1",
    ], 
    chains: [CHAIN.BSC],
  }, 
];

// Helper function to get performers for a specific chain
const getPerformersForChain = (chain: string): string[] => {
  const performers: string[] = [];
  
  // Add production user op sender for all EVM chains
  if (chain !== CHAIN.SOLANA) {
    performers.push(PRODUCTION_USER_OP_SENDER);
  }
  
  // Add chain-specific performers
  performerGroups.forEach(group => {
    if (group.chains.includes(chain as any)) {
      performers.push(...group.performers);
    }
  });
  
  return performers;
};

const FeeAdresses: Record<string, string[]> = {
  [CHAIN.ARBITRUM]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
    ...getPerformersForChain(CHAIN.ARBITRUM)
  ],
  [CHAIN.AVAX]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
    ...getPerformersForChain(CHAIN.AVAX)
  ],
  [CHAIN.BASE]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
    ...getPerformersForChain(CHAIN.BASE)
  ],
  [CHAIN.ETHEREUM]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
    ...getPerformersForChain(CHAIN.ETHEREUM)
  ],
  [CHAIN.OPTIMISM]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
    ...getPerformersForChain(CHAIN.OPTIMISM)
  ],
  [CHAIN.POLYGON]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
    ...getPerformersForChain(CHAIN.POLYGON)
  ],
  [CHAIN.SOLANA]: [
    "Ggp9SGTqAKiJWRXeyEb2gEVdmD6n7fgHD7t4s8DrAqwf",
    ...PRODUCTION_SOLANA_PERFORMERS
  ],
  // [CHAIN.HYPERLIQUID]: [
  //   "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
  // ],
  [CHAIN.BSC]: [
    "0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643",
    ...getPerformersForChain(CHAIN.BSC)
  ],
}

const fetch = async (options: FetchOptions) => {
  const vaults = FeeAdresses[options.chain];
  if (!vaults.length) return { dailyFees: 0, dailyRevenue: 0, dailyProtocolRevenue: 0 };

  let dailyFees;
  if (options.chain === CHAIN.SOLANA) {
    // Keep Solana implementation unchanged
    dailyFees = await getSolanaReceived({
      options,
      targets: vaults,
    });
  } else {
    // Use addOneFeeToken for EVM chains
    // Get all token transfers to fee addresses
    const allTokenFees = await addTokensReceived({
      options,
      targets: vaults,
    });
    
    // Also get native token transfers
    const nativeFees = await getETHReceived({
      options,
      targets: vaults,
    });
    
    // Combine both fee types
    dailyFees = options.createBalances();
    dailyFees.addBalances(allTokenFees);
    dailyFees.addBalances(nativeFees);
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
    // TODO: Add Hyperliquid support
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
    [CHAIN.SOLANA]: {
      fetch,
      start: '2022-01-01',
      meta: { methodology }
    },
  },
};

export default adapter;

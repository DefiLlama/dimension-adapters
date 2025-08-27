import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived, getSolanaReceived, addTokensReceived } from "../helpers/token";

// https://metabase.definitive.fi/public/dashboard/80e43551-a7e9-4503-8ac5-d5697a4a3734?tab=17-revenue

// Production user op sender
const PRODUCTION_USER_OP_SENDER = "0x5712F863D5898bA78041f58e34e190549Cb4B813";

const BASE_PERFORMERS = [
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
]

// Performer groups by chain
const ARB_AVAX_BASE_ETH_PERFORMERS = [
  "0x25378b4200e3BD002b696b10A4F5E2e5B5786CDD",
  "0xb60Afc036E86cB7FdFd5Db7268df3527e2113933",
  "0xEf586A266036c3D25591fFc4470D82AB8Dd14FF9",
  "0x7470A213536B7Fb86a84e31C148eF11a1dd3cA52",
  "0x1ad2dF0E33378c5c6479A92990a6c2c005Bf3B60",
  "0x4f8fc8031e35ea47bea0ff7466f5fc702fa84a63",
  "0xd056C0eEE354b24fE7c5d4Ee762C4D7574bAdaC1",
]

const chainConfig: Record<string, { feeAddresses: string[], start: string }> = {
  [CHAIN.SOLANA]: {
    feeAddresses: [
      "Ggp9SGTqAKiJWRXeyEb2gEVdmD6n7fgHD7t4s8DrAqwf", 
      // "GEe8eQ1cBH8cXX2Nba4xFhKMpH9KxSre3c3uMVD5yXRJ",
      // "5Dr7kc6U9hrwv1PQz67nyvhUpvXdQibt6L8RHwUrt2L4",
      // "9XLonXfbZqBp66WRDScfRp1MJYKd4k4tUDibMQBLJehJ",
      // "2Rf9qzW9rhCnJmEbErrHDDZfeEXtemYdLkyJ1TE12pa7", 
      // "A1GC8eqyezWb5gbgaLxzg93LgP84SXhLZymmv7g4t87a" 
    ],
    start: '2022-01-01'
  },
  [CHAIN.BASE]: {
    feeAddresses: ["0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643", PRODUCTION_USER_OP_SENDER, ...BASE_PERFORMERS, ...ARB_AVAX_BASE_ETH_PERFORMERS],
    start: '2022-01-01'
  },
  [CHAIN.ETHEREUM]: {
    feeAddresses: ["0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643", PRODUCTION_USER_OP_SENDER, ...ARB_AVAX_BASE_ETH_PERFORMERS],
    start: '2022-01-01'
  },
  [CHAIN.OPTIMISM]: {
    feeAddresses: ["0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643", PRODUCTION_USER_OP_SENDER],
    start: '2022-01-01'
  },
  [CHAIN.POLYGON]: {
    feeAddresses: ["0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643", PRODUCTION_USER_OP_SENDER],
    start: '2022-01-01'
  },
  [CHAIN.BSC]: {
    feeAddresses: ["0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643", PRODUCTION_USER_OP_SENDER, "0xd056C0eEE354b24fE7c5d4Ee762C4D7574bAdaC1"],
    start: '2022-01-01'
  },
  [CHAIN.ARBITRUM]: {
    feeAddresses: ["0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643", PRODUCTION_USER_OP_SENDER, ...ARB_AVAX_BASE_ETH_PERFORMERS],
    start: '2022-01-01'
  },
  [CHAIN.AVAX]: {
    feeAddresses: ["0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643", PRODUCTION_USER_OP_SENDER, ...ARB_AVAX_BASE_ETH_PERFORMERS],
    start: '2022-01-01'
  },
  // [CHAIN.HYPERLIQUID]: {
  //   feeAddresses: [PRODUCTION_USER_OP_SENDER],
  //   start: '2025-01-01'
  // }
}

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const vaults = chainConfig[options.chain].feeAddresses;
  if (!vaults.length) return { dailyFees: 0, dailyRevenue: 0, dailyProtocolRevenue: 0 };

  let dailyFees;
  if (options.chain === CHAIN.SOLANA) {
    dailyFees = await getSolanaReceived({
      options,
      targets: vaults,
      blacklists: vaults,
    });
  } else {
    const allTokenFees = await addTokensReceived({
      options,
      targets: vaults,
    });
    const nativeFees = await getETHReceived({
      options,
      targets: vaults,
    });
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
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;

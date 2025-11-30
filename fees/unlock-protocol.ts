import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Unlock contract addresses on each chain
const UNLOCK_CONTRACTS: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: "0xe79B93f8E22676774F2A8dAd469175ebd00029FA",
  [CHAIN.OPTIMISM]: "0x99b1348a9129ac49c6de7F11245773dE2f51fB0c",
  [CHAIN.BSC]: "0xeC83410DbC48C7797D2f2AFe624881674c65c856",
  [CHAIN.XDAI]: "0x1bc53f4303c711cc693F6Ec3477B83703DcB317f",
  [CHAIN.POLYGON]: "0xE8E5cd156f89F7bdB267EabD5C43Af3d5AF2A78f",
  [CHAIN.BASE]: "0xd0b14797b9D08493392865647384974470202A78",
  [CHAIN.ARBITRUM]: "0x1FF7e338d5E582138C46044dc238543Ce555C963",
  [CHAIN.CELO]: "0x1FF7e338d5E582138C46044dc238543Ce555C963",
  [CHAIN.AVAX]: "0x70cBE5F72dD85aA634d07d2227a421144Af734b3",
  [CHAIN.LINEA]: "0x70B3c9Dd9788570FAAb24B92c3a57d99f8186Cc7",
  [CHAIN.ERA]: "0x32CF553582159F12fBb1Ae1649b3670395610F24",
  [CHAIN.POLYGON_ZKEVM]: "0x259813B665C8f6074391028ef782e27B65840d89",
  [CHAIN.SCROLL]: "0x259813B665C8f6074391028ef782e27B65840d89",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const gnpStart = await options.fromApi.call({ target: UNLOCK_CONTRACTS[options.chain], abi: "uint256:grossNetworkProduct", permitFailure: true});
  const gnpEnd = await options.toApi.call({ target: UNLOCK_CONTRACTS[options.chain], abi: "uint256:grossNetworkProduct", permitFailure: true});

  if (gnpEnd && gnpStart) {
    const dailyGNP = gnpEnd - gnpStart;
  
    // Only add positive daily changes (handles resets/errors)
    if (dailyGNP > 0) {
      dailyFees.addGasToken(dailyGNP);
      dailyRevenue.addGasToken(dailyGNP * 0.01); // 1% to protocol
      dailySupplySideRevenue.addGasToken(dailyGNP * 0.99); // 99% to creators
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Gross network product delta recorded by each Unlock contract across supported chains.",
    Revenue: "Unlock DAO keeps the protocol fee (1% of each key purchase/renewal).",
    ProtocolRevenue: "Equal to total revenue because Unlock DAO accrues the entire protocol fee.",
    SupplySideRevenue: "Remaining 99% of the gross network product flows to individual lock creators.",
  },
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2020-06-01' },
    [CHAIN.OPTIMISM]: { fetch, start: '2021-11-11' },
    [CHAIN.BSC]: { fetch, start: '2021-09-09' },
    [CHAIN.XDAI]: { fetch, start: '2021-09-09' },
    [CHAIN.POLYGON]: { fetch, start: '2021-09-09' },
    [CHAIN.BASE]: { fetch, start: '2023-08-01' },
    [CHAIN.ARBITRUM]: { fetch, start: '2022-11-01' },
    [CHAIN.CELO]: { fetch, start: '2022-01-12' },
    [CHAIN.AVAX]: { fetch, start: '2022-02-21' },
    [CHAIN.LINEA]: { fetch, start: '2023-07-21' },
    [CHAIN.ERA]: { fetch, start: '2023-06-01' },
    [CHAIN.POLYGON_ZKEVM]: { fetch, start: '2023-06-01' },
    [CHAIN.SCROLL]: { fetch, start: '2023-10-16' },
  },
};

export default adapter;

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
  const { chain, createBalances, fromApi, toApi } = options;

  const unlockContract = UNLOCK_CONTRACTS[chain];
  if (!unlockContract) {
    throw new Error(`No Unlock contract configured for chain: ${chain}`);
  }

  const dailyFees = createBalances();

  const gnpStart = await fromApi.call({
    target: unlockContract,
    abi: "uint256:grossNetworkProduct",
    permitFailure: true,
  }) || 0;

  const gnpEnd = await toApi.call({
    target: unlockContract,
    abi: "uint256:grossNetworkProduct",
    permitFailure: true,
  }) || 0;

  const dailyGNP = gnpEnd - gnpStart;

  // Only add positive daily changes (handles resets/errors)
  if (dailyGNP > 0) {
    dailyFees.addGasToken(dailyGNP);
  }

  // Split: 1% protocol fee, 99% to lock creators
  const dailyProtocolRevenue = dailyFees.clone(0.01);
  const dailySupplySideRevenue = dailyFees.clone(0.99);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
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
    [CHAIN.ETHEREUM]: { fetch, start: 1590969600 },
    [CHAIN.OPTIMISM]: { fetch, start: 1636588800 },
    [CHAIN.BSC]: { fetch, start: 1631145600 },
    [CHAIN.XDAI]: { fetch, start: 1631145600 },
    [CHAIN.POLYGON]: { fetch, start: 1631145600 },
    [CHAIN.BASE]: { fetch, start: 1690848000 },
    [CHAIN.ARBITRUM]: { fetch, start: 1667260800 },
    [CHAIN.CELO]: { fetch, start: 1641945600 },
    [CHAIN.AVAX]: { fetch, start: 1645401600 },
    [CHAIN.LINEA]: { fetch, start: 1689897600 },
    [CHAIN.ERA]: { fetch, start: 1685577600 },
    [CHAIN.POLYGON_ZKEVM]: { fetch, start: 1685577600 },
    [CHAIN.SCROLL]: { fetch, start: 1697414400 },
  },
};

export default adapter;

import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";


type TAddress = {
  [l: string | Chain]: string;
}

const address: TAddress = {
  [CHAIN.ARBITRUM]: '0xE10997B8d5C6e8b660451f61accF4BBA00bc901f',
  [CHAIN.BSC]: '0xcebdff400A23E5Ad1CDeB11AfdD0087d5E9dFed8',
  [CHAIN.ETHEREUM]: '0x28E395a54a64284DBA39652921Cd99924f4e3797',
  [CHAIN.BASE]: '0xC49b4D1e6CbbF4cAEf542f297449696d8B47E411'
}

const fetch = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances()
  const logs = await getLogs({ target: address[chain], eventAbi: 'event NewTransferAdded (address indexed asset, uint256 lpUsdValue)' })
  logs.forEach((log) => dailyFees.addUSDValue(Number(log.lpUsdValue) / 1e18))
  const dailySupplySideRevenue = dailyFees.clone(0.25);
  const dailyHoldersRevenue = dailyFees.clone(0.60);
  const dailyProtocolRevenue = dailyFees.clone(0.15);
  const dailyRevenue = dailyFees.clone(0.85);

  return { dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyFees, };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: 1679097600, },
    [CHAIN.BSC]: { fetch, start: 1679788800, },
    [CHAIN.ETHEREUM]: { fetch, start: 1698796800, },
    [CHAIN.BASE]: { fetch, start: 1719592253, },
  }
}

export default adapter;

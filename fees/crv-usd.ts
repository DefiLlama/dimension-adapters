import { Chain } from "@defillama/sdk/build/general";
import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

type TContract = {
  [s: string | Chain]: string[];
}
const controller: TContract = {
  [CHAIN.ETHEREUM]: [
    '0x1c91da0223c763d2e0173243eadaa0a2ea47e704',
    '0xec0820efafc41d8943ee8de495fc9ba8495b15cf',
    '0xa920de414ea4ab66b97da1bfe9e6eca7d4219635',
    '0x4e59541306910ad6dc1dac0ac9dfb29bd9f15c67',
    '0x100daa78fc509db39ef7d04de0c1abd299f4c6ce',
    '0x8472a9a7632b173c8cf3a86d3afec50c35548e76'
  ]
}

const fetchFees = (chain: Chain) => {
  return async ({ createBalances, getLogs, fromApi, toApi }: FetchOptions) => {
    const dailyFees = createBalances()
    await Promise.all(controller[chain].map(async controller=>{
      const logs = await getLogs({ target: controller, eventAbi: 'event CollectFees (uint256 amount, uint256 new_supply)' })
      logs.forEach((i: any) => dailyFees.add('0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E', i.amount))
      const feesStart = await fromApi.call({target: controller, abi: "uint:admin_fees"})
      const feesEnd = await toApi.call({target: controller, abi: "uint:admin_fees"})
      dailyFees.add("0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E", feesEnd-feesStart)
    }))

    return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: 1684047600
    }
  },
  version: 2
}
export default adapters;

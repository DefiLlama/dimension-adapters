import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IContract = {
  [c: string | Chain]: string;
}

const contract: IContract = {
  [CHAIN.ARBITRUM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.OPTIMISM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.BASE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ETHEREUM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.AVAX]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.BSC]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.POLYGON]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.POLYGON_ZKEVM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.FANTOM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae'
}

const fetch: any = async (timestamp: number, _, { chain, getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances();
  const data: any[] = await getLogs({
    target: contract[chain],
    eventAbi: 'event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)'
  })
  data.forEach((e: any) => dailyVolume.add(e.toAssetId, e.toAmount));
  return { dailyVolume, timestamp, } as any;
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(contract).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: 1691625600, }
    }
  }, {})
};

export default adapter;

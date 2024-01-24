import { Chain } from "@defillama/sdk/build/general";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

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
interface IData {
  integrator: string;
  fromAssetId: string;
  toAssetId: string;
  fromAmount: number;
  toAmount: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;
    const api = new sdk.ChainApi({ chain, timestamp });
    try {
      const data: IData[] = (await api.getLogs({
        target: contract[chain],
        fromTimestamp, toTimestamp,
        chain: chain,
        onlyArgs: true,
        eventAbi: 'event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)'
      })) as any
      console.log(data.length, chain)
      data.forEach((e: IData) => api.add(e.toAssetId, e.toAmount));
      const { usdTvl } = await api.getUSDJSONs()
      return {
        dailyVolume: Number(usdTvl).toFixed(0),
        timestamp,
      } as any;
    } catch (error) {
      console.error(error);
      throw error;
    }
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(contract).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain),
        start: async () => 1691625600,
      }
    }
  }, {})
};

export default adapter;

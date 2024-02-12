import ADDRESSES from '../../helpers/coreAssets.json'
import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import { getPrices } from "../../utils/prices";

interface IGraph {
  makerAssetAddr: string;
  makerAssetAmount: string;
}


interface IData {
  fillOrders: IGraph[];
  swappeds: IGraph[];
}

type TEndpoint = {
  [s: string | Chain]: string;
};

const endpoints: TEndpoint = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/consenlabs/tokenlon-v5-exchange",
};

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, fromTimestamp, toTimestamp, }: FetchOptions): Promise<FetchResultVolume> => {
    const dailyVolume = createBalances()
    const query = `
    {
      swappeds(first:1000, where:{timestamp_gte:${fromTimestamp}, timestamp_lte:${toTimestamp}}) {
        makerAssetAddr
        makerAssetAmount
      }
      fillOrders(first:1000, where:{timestamp_gte:${fromTimestamp}, timestamp_lte:${toTimestamp}}) {
        makerAssetAddr
        makerAssetAmount
      }
    }
    `;
    const response: IData = (await request(endpoints[chain], query));
    const historicalData: IGraph[] = [...response.fillOrders, ...response.swappeds]
    historicalData.map((e: IGraph) => {
      dailyVolume.add(e.makerAssetAddr, e.makerAssetAmount)
    })
    return { dailyVolume, timestamp: toTimestamp }
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume(CHAIN.ETHEREUM),
      start: 1608216488,
    },
  },
};

export default adapter;

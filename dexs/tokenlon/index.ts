import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
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
  [CHAIN.ETHEREUM]:"https://api.thegraph.com/subgraphs/name/consenlabs/tokenlon-v5-exchange",
};

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const query = gql`
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
    const coins = [...new Set(historicalData.map((e: IGraph) => `${chain}:${e.makerAssetAddr}`))]
    const prices = await getPrices(coins, toTimestamp);
    const dailyVolume = historicalData.map((e: IGraph) => {
      const price = prices[`${chain}:${e.makerAssetAddr}`].price;
      const decimals = prices[`${chain}:${e.makerAssetAddr}`].decimals;
      return (Number(e.makerAssetAmount) / 10 ** decimals) * price;
    }).filter((e: any) => !isNaN(e))
    .reduce((a: number, b: number) => a + b, 0);

    return {
      dailyVolume: `${dailyVolume}`,
      timestamp: toTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume(CHAIN.ETHEREUM),
      start: async () => 1608216488,
    },
  },
};

export default adapter;

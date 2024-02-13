import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { request, } from "graphql-request";

type TEndpoint = {
  [s: Chain | string]: string;
}
const endpoints: TEndpoint = {
  [CHAIN.BASE]: "https://subgraphs.blazebot.io/subgraphs/name/blazebot/stats",
}

interface ISwap {
  id: string;
  fee: BigInt;
}
const graphs = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, fromTimestamp, toTimestamp }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances()
    const query = `
          {
            fees(where: {
              timestamp_gte: ${fromTimestamp}
              timestamp_lte: ${toTimestamp}
            }, orderBy:fee, orderDirection: desc) {
              id
              fee
            }
          }
        `
    const graphRes: ISwap[] = (await request(endpoints[chain], query)).fees;

    graphRes.map((e: ISwap) => dailyFees.addGasToken(e.fee))
    return { dailyFees, timestamp }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: graphs(CHAIN.BASE),
      start: 1694131200,
    },
  }
}

export default adapter;

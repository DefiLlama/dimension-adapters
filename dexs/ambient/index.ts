import {Adapter, FetchResultVolume} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {Chain} from "@defillama/sdk/build/general";
import {request, gql} from "graphql-request";
import {getTimestampAtStartOfDayUTC} from "../../utils/date";
import { getPrices } from "../../utils/prices";

type TEndpoint = {
  [s: Chain | string]: string;
}
const endpoints: TEndpoint = {
    [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/crocswap/croc-mainnet",
}
interface IPool {
  quote: string;
}
interface ISwap {
  quoteFlow: string;
  pool: IPool;
  dex: string;
}
const graphs = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultVolume> => {
        const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
        const fromTimestamp = todaysTimestamp - 60 * 60 * 24
        const toTimestamp = todaysTimestamp
        const query = gql`
          {
            swaps(where: {
              time_gte: ${fromTimestamp}
              time_lte: ${toTimestamp}
              dex: "croc"
            }, orderBy:time, orderDirection: desc) {
              quoteFlow
              pool {
                quote
              }
              dex
            }
          }
        `
      const graphRes: ISwap[] = (await request(endpoints[chain], query)).swaps;
      const coins = [...new Set(graphRes.map((e: ISwap) => `${chain}:${e.pool.quote.toLowerCase()}`))]
      const prices = await getPrices(coins, todaysTimestamp);
      const dailyVolume = graphRes.map((e: ISwap) => {
        const decimals = prices[`${chain}:${e.pool.quote.toLowerCase()}`].decimals;
        const price = prices[`${chain}:${e.pool.quote.toLowerCase()}`].price;
        return (Number(e.quoteFlow.replace('-','')) / 10 ** decimals) * price
      }).reduce((a: number, b: number) => a + b, 0)
      return {
        dailyVolume: `${dailyVolume}`,
        timestamp,
      };
    }
}


const adapter: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: graphs(CHAIN.ETHEREUM),
            start: async () => 1685232000,
        },
    }
}

export default adapter;

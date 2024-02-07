import {Adapter, FetchResultVolume} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {Chain} from "@defillama/sdk/build/general";
import {request, gql} from "graphql-request";
import {getTimestampAtStartOfDayUTC} from "../../utils/date";
import { getPrices } from "../../utils/prices";
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { type } from "os";

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
        const decimals = prices[`${chain}:${e.pool.quote.toLowerCase()}`]?.decimals || 0;
        const price = prices[`${chain}:${e.pool.quote.toLowerCase()}`]?.price || 0;
        return (Number(e.quoteFlow.replace('-','')) / 10 ** decimals) * price
      }).reduce((a: number, b: number) => a + b, 0)
      return {
        dailyVolume: `${dailyVolume}`,
        timestamp,
      };
    }
}

const swapEvent = 'event CrocSwap (address indexed base, address indexed quote, uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip, uint128 limitPrice, uint128 minOut, uint8 reserveFlags, int128 baseFlow, int128 quoteFlow)';

type TContractAddress = {
  [s: Chain]: string;
}
interface ILog {
  quote: string;
  quoteFlow: string;
}
const contract_address: TContractAddress = {
  [CHAIN.SCROLL]: '0xaaaaaaaacb71bf2c8cae522ea5fa455571a74106'
}

const fetchVolume = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultVolume> => {
        const toTimestamp = getTimestampAtStartOfDayUTC(timestamp)
        const fromTimestamp = toTimestamp - 60 * 60 * 24
        const balances = new sdk.Balances({ chain, timestamp })
        const fromBlock = await getBlock(fromTimestamp, chain, {})
        const toBlock = await getBlock(toTimestamp, chain, {})

        const logs: ILog[] = (await sdk.getEventLogs({
          target: contract_address[chain],
          toBlock: toBlock,
          fromBlock: fromBlock,
          chain,
          eventAbi: swapEvent,
          flatten: false,
          onlyArgs: true,
        })) as ILog[];
        logs.forEach((log: ILog) => {
          balances.add(log.quote, log.quoteFlow)
        });
        return {
            dailyVolume: await balances.getUSDString(),
            timestamp,
        }
    }
}


const adapter: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: graphs(CHAIN.ETHEREUM),
            start: async () => 1685232000,
        },
        [CHAIN.SCROLL]: {
            fetch: fetchVolume(CHAIN.SCROLL),
            start: async () => 1685232000,
        },
    }
}

export default adapter;

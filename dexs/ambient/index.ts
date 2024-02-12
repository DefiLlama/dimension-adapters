import { Adapter, ChainBlocks, FetchOptions, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { request, } from "graphql-request";

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

const toPositive = (n: any) => +n > 0 ? +n : n * -1

const graphs = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { fromTimestamp, toTimestamp, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
    const query = `
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
    const dailyVolume = createBalances()
    graphRes.map((e: ISwap) => {
      dailyVolume.add(e.pool.quote, toPositive(e.quoteFlow))
    })
    return { dailyVolume, timestamp, }
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
  [CHAIN.SCROLL]: '0xaaaaaaaacb71bf2c8cae522ea5fa455571a74106',
}

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
    const dailyVolume = createBalances()
    const logs: ILog[] = await getLogs({ target: contract_address[chain], eventAbi: swapEvent, })
    logs.forEach((log: ILog) => dailyVolume.add(log.quote, Number(log.quoteFlow) < 0 ? 0 : log.quoteFlow));
    return { dailyVolume, timestamp, }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graphs(CHAIN.ETHEREUM),
      start: 1685232000,
    },
    [CHAIN.SCROLL]: {
      fetch: fetchVolume(CHAIN.SCROLL),
      start: 1685232000,
    },
  }
}

export default adapter;

import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const gurar = '0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b';
const abis: any = {
  "forSwaps": "function forSwaps() view returns ((address lp, bool stable, address token0, address token1, address factory)[])"
}

interface IForSwap {
  lp: string;
  token0: string;
  token1: string;
}

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
  topics: string[];
}
const event_swap = 'event Swap(address indexed sender,address indexed to,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out)'

const fetch = async (timestamp: number, _: any, { api, getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances()
  const forSwaps: IForSwap[] = (await api.call({
    target: gurar,
    abi: abis.forSwaps,
    chain: CHAIN.BASE,
  })).map((e: any) => {
    return {
      lp: e.lp,
      token0: e.token0,
      token1: e.token1,
    }
  })

  const targets = forSwaps.map((forSwap: IForSwap) => forSwap.lp)

  const logs: ILog[][] = await getLogs({
    targets,
    eventAbi: event_swap,
    flatten: false,
  })

  logs.forEach((logs: ILog[], idx: number) => {
    const { token0, token1 } = forSwaps[idx]
    logs.forEach((log: any) => {
      dailyVolume.add(token0, log.amount0Out)
      dailyVolume.add(token1, log.amount1Out)
    })
  })

  return { dailyVolume, timestamp }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: 1693180800,
    }
  }
}
export default adapters;

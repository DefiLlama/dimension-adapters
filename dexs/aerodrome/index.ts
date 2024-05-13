import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const gurar = '0x066D31221152f1f483DA474d1Ce47a4F50433e22';
const abis: any = {
  "forSwaps": "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, bool stable, address token0, address token1, address factory, uint256 poolFee)[])"
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
    params: [1000, 0],
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

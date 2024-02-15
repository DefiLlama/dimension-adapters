import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"


const lphelper = '0x11D66FF243715169d6C14865E18fcc30d3557830';
const abis: any = {
  "forSwaps": "function forSwaps() view returns ((address lp, bool stable, address token0, address token1, address factory, uint256 poolFee)[])"
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
    target: lphelper,
    abi: abis.forSwaps,
    chain: CHAIN.ZETA,
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
    [CHAIN.ZETA]: {
      fetch: fetch as any,
      start: 1707177600,
    }
  }
}
export default adapters;

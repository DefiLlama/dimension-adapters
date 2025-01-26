import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const address = '0x5839389261D1F38aac7c8E91DcDa85646bEcB414'
const event_route = 'event Route(address indexed from,address to,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOutMin,uint256 amountOut)'

const fetchVolume = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: address,
    eventAbi: event_route,
  })

  const dailyVolume = options.createBalances()

  logs.forEach(log => {
    dailyVolume.add(
      log.tokenOut,
      log.amountOut,
    )
  })
  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.INK]: {
      fetch: fetchVolume,
      start: '2025-01-07',
    },
  },
}

export default adapter;

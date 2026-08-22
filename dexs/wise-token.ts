import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { addOneToken } from "../helpers/prices";

// WISE/ETH Uniswap V2 pair - same pair tracked in fees/wise-token.ts
const WISE_ETH_PAIR = '0x21b8065d10f73EE2e260e5B47D3344d3Ced7596E'

const SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  const token0 = await options.api.call({ target: WISE_ETH_PAIR, abi: 'address:token0' })
  const token1 = await options.api.call({ target: WISE_ETH_PAIR, abi: 'address:token1' })

  const logs = await options.getLogs({ target: WISE_ETH_PAIR, eventAbi: SwapEvent })

  for (const log of logs) {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
  }

  return { dailyVolume }
}

const methodology = {
  Volume: 'Swap volume (both sides) on the WISE/ETH Uniswap V2 pair.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology,
}

export default adapter;

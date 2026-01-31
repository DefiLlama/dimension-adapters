import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from '../../helpers/chains'

const POOL = '0x22787c26bb0ab0d331eb840ff010855a70a0dca6';
const SwapEvent = 'event Swap(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 priceIn, uint256 priceOut)';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  
  const logs = await options.getLogs({
    target: POOL,
    eventAbi: SwapEvent,
  })
  for (const log of logs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
  }

  return { dailyVolume };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-10-09',
    },
  },
}

export default adapter;

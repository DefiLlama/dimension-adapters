import {
  FetchOptions, SimpleAdapter
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const contract = '0x45A62B090DF48243F12A21897e7ed91863E2c86b';
const event_swapIn = 'event SwapExactIn(address indexed sender,address to,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)';
const event_swapOut = 'event SwapExactOut(address indexed sender,address to,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs_swapIn = await options.getLogs({
    target: contract,
    eventAbi: event_swapIn,
  });

  const logs_swapOut = await options.getLogs({
    target: contract,
    eventAbi: event_swapOut,
  });

  logs_swapIn.forEach(log => {
    dailyVolume.add(log.tokenIn, log.amountIn);
  });

  logs_swapOut.forEach(log => {
    dailyVolume.add(log.tokenOut, log.amountOut);
  });

  return {
    dailyVolume,
  }

}


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
    },
    [CHAIN.ARBITRUM]: {
      fetch,
    },
  }
}

export default adapter;

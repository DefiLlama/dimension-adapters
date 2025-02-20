import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const address: any = {
  [CHAIN.LINEA]: '0x7e0da0deccac2e7b9ad06e378ee09c15b5bdeefa',
  [CHAIN.XDC]: '0x7e0da0deccac2e7b9ad06e378ee09c15b5bdeefa',
  [CHAIN.POLYGON]: '0xA42e5d2A738F83a1e1a907eB3aE031e5A768C085',
  [CHAIN.BOBA]: '0x7E0DA0DECCAc2E7B9AD06E378ee09c15B5BDeefa'
}

const fetchVolume: FetchV2 = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: address[options.chain],
    eventAbi: 'event Swap(uint8 dex, address sender, address recipient, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
  })
  const dailyVolume = options.createBalances();
  logs.forEach((log: any) => {
     addOneToken({ chain: options.chain, balances: dailyVolume, token0: log.tokenIn, token1: log.tokenOut, amount0: log.amountIn, amount1: log.amountOut })
  });
  return {
    dailyVolume: dailyVolume,
  }
}
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: fetchVolume,
      start: '2024-01-01',
    },
    [CHAIN.XDC]: {
      fetch: fetchVolume,
      start: '2024-01-01',
    },
    [CHAIN.POLYGON]: {
      fetch: fetchVolume,
      start: '2024-01-01',
    },
    [CHAIN.BOBA]: {
      fetch: fetchVolume,
      start: '2024-01-01',
    },
  }
}
export default adapter;

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const vaults: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0xd315a9C38eC871068FEC378E4Ce78AF528C76293',
  [CHAIN.POLYGON]: '0xd315a9C38eC871068FEC378E4Ce78AF528C76293',
  [CHAIN.ARBITRUM]: '0xd315a9C38eC871068FEC378E4Ce78AF528C76293',
  [CHAIN.OPTIMISM]: '0xd315a9C38eC871068FEC378E4Ce78AF528C76293',
  [CHAIN.BSC]: '0x03c01acae3d0173a93d819efdc832c7c4f153b06',
  [CHAIN.BASE]: '0x03c01acae3d0173a93d819efdc832c7c4f153b06',
}
const swapEvent = 'event Swap(bytes32 indexed poolId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)'

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const swaps = await options.getLogs({ target: vaults[options.chain], eventAbi: swapEvent })
  swaps.forEach((swap: any) => {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: swap.tokenIn, token1: swap.tokenOut, amount0: swap.amountIn, amount1: swap.amountOut })
  })
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  // no swaps on any chain after 2026-10-06 and vault TVL drained from $7.2M to $0.5M on 2026-10-07
  deadFrom: '2026-10-07',
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-07-01' },
    [CHAIN.POLYGON]: { start: '2023-06-30' },
    [CHAIN.ARBITRUM]: { start: '2023-10-05' },
    [CHAIN.OPTIMISM]: { start: '2024-05-29' },
    [CHAIN.BSC]: { start: '2024-05-29' },
    [CHAIN.BASE]: { start: '2024-05-14' },
  },
  methodology: {
    Volume: "Value of all tokens swapped through Swaap Maker V2 vault pools.",
  },
};

export default adapter;

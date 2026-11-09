import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// Both swappers fill from the same inventory vault (0x585d44727129B9C69791B10238Ca605932938B4F).
// The second one went live 2026-06-08 with a renamed event and carries ~23% of volume.
const swappers = [
  {
    target: "0xb1076fE3AB5e28005C7c323Bac5AC06a680d452e",
    eventAbi: 'event FermiSwap(address indexed recipient, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  },
  {
    target: "0x5979458912F80B96d30D4220af8E2e4925A33320",
    eventAbi: 'event Swapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)',
  },
]

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const logs = await Promise.all(swappers.map(({ target, eventAbi }) => getLogs({ target, eventAbi })));
  logs.flat().forEach((log: any) => {
    addOneToken({
      chain: options.chain,
      balances: dailyVolume,
      token0: log.tokenIn,
      amount0: log.amountIn,
      token1: log.tokenOut,
      amount1: log.amountOut
    })
  });
  return { dailyVolume };
}

const methodology = {
  Volume: "Total value traded against FermiSwap, counted once per swap. FermiSwap is a market maker that fills orders out of its own token inventory instead of shared liquidity pools, so this counts only the trades it fills itself.",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-05-12",
  methodology,
};

export default adapter;

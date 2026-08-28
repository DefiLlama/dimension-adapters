import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const FACTORY = "0x851fc799c9f1443a2c1e6b966605a80f8a1b1bf2";

const swapEvent =
  "event Swap(address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut, address recipient)";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  // Get all listed tokens from the PropPoolFactory
  const listedTokens: string[] = await options.api.call({
    target: FACTORY,
    abi: "function getListedTokens() view returns (address[])",
  });

  // Get pool address for each token
  const pools: string[] = await options.api.multiCall({
    target: FACTORY,
    calls: listedTokens,
    abi: "function getPropPool(address token) view returns (address)",
  });

  // Fetch Swap events from all pools
  const swaps = await options.getLogs({
    targets: pools,
    eventAbi: swapEvent,
  });

  for (const log of swaps) {
    addOneToken({
      chain: options.chain,
      balances: dailyVolume,
      token0: log.tokenIn,
      amount0: log.amountIn,
      token1: log.tokenOut,
      amount1: log.amountOut,
    });
  }

  return { dailyVolume };
}

const methodology = {
  Volume:
    "Volume is calculated from Swap events on Wasabi Prop AMM pools, using the USDC side of each trade.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-02-09",
    },
  },
};

export default adapter;

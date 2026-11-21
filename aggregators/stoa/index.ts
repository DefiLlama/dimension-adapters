import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// StoaRouter emits one Routed event per settled swap, direct or through one hop (source:
// https://github.com/StoaDex/Stoa/blob/main/contracts/src/StoaRouter.sol). A failed swap reverts and emits nothing.
const ROUTED = "event Routed(address indexed sender, address indexed to, address indexed referrer, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address mid, address venue1, address venue2)";
// StoaRouter.NATIVE (the zero address) is tokenIn/tokenOut for the chain's gas token (ETH on Robinhood Chain, HYPE on Elysium).
// The router wraps it itself, so native legs are priced as `wrapped`, the router's whype() on each chain.
const chainConfig: Record<string, { router: string; wrapped: string; start: string }> = {
  // https://robinhoodchain.blockscout.com/address/0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5 (deployed block 114244443, first swap 2026-11-14)
  [CHAIN.ROBINHOOD]: { router: "0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5", wrapped: ADDRESSES.robinhood.WETH, start: "2026-11-14" },
  // https://elysium.kinetiq.xyz/address/0x104752D50ef893da579Ad813918269e09Ea17dbA (deployed block 5216650, first swap 2026-11-12)
  [CHAIN.ELYSIUM]: { router: "0x104752D50ef893da579Ad813918269e09Ea17dbA", wrapped: ADDRESSES.elysium.WHYPE, start: "2026-11-12" },
};

const fetch = async (options: FetchOptions) => {
  const { router, wrapped } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ target: router, eventAbi: ROUTED });

  const asWrapped = (token: string) => (token.toLowerCase() === ADDRESSES.null ? wrapped : token);

  for (const log of logs) {
    // one side per swap: the core asset (WETH, USDG, WHYPE, USDC...) when there is one, so long-tail tokens are not priced
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: asWrapped(log.tokenIn), amount0: log.amountIn, token1: asWrapped(log.tokenOut), amount1: log.amountOut });
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Value of the tokens swapped through the Stoa router on Robinhood Chain and Elysium, counted once per swap on the side priced in a major token.",
  },
};

export default adapter;

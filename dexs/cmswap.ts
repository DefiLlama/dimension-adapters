/**
 * cmswap / Junoswap.trade — DEX Aggregator + bonding-curve launchpad volume, on Bitkub Chain.
 *
 * Two independent volume sources, both routed through contracts owned by the protocol:
 *  - AggRouterJunoswap: the multi-DEX aggregator router users swap through
 *    (routes across Udonswap, KUBLERX, Diamond, Jibswap and Junoswap's own V3 pools).
 *  - BondingCurveJunoswap: the memecoin launchpad's buy/sell bonding curve.
 *
 * Junoswap's own V3 pools (tracked for TVL under projects/cmswap in DefiLlama-Adapters)
 * mainly host graduated launchpad tokens; their raw swap volume is not counted here since
 * routed trades already surface as Aggregated events above.
 */
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";
import ADDRESSES from "../helpers/coreAssets.json";

const AGG_ROUTER = "0x869A40921A332e0D79300F91361A3DC77F2a0ebc";
const BONDING_CURVE = "0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e";

const AGGREGATED_ABI =
  "event Aggregated(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 legs, address referrer)";
const SWAP_ABI =
  "event Swap(address indexed sender, bool indexed isBuy, address indexed tokenAddr, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)";

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyVolume = createBalances();

  const aggLogs = await getLogs({ target: AGG_ROUTER, eventAbi: AGGREGATED_ABI });
  for (const log of aggLogs) {
    addOneToken({ chain, balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
  }

  const swapLogs = await getLogs({ target: BONDING_CURVE, eventAbi: SWAP_ABI });
  for (const log of swapLogs) {
    const [tokenIn, tokenOut] = log.isBuy ? [ADDRESSES.null, log.tokenAddr] : [log.tokenAddr, ADDRESSES.null];
    addOneToken({ chain, balances: dailyVolume, token0: tokenIn, amount0: log.amountIn, token1: tokenOut, amount1: log.amountOut });
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of swap volume routed through the Junoswap Aggregator Router (multi-DEX best-price routing across several Bitkub Chain DEXs) plus buy/sell volume on the Junoswap bonding-curve launchpad.",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      start: "2026-06-17",
    },
  },
  methodology,
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * TartSwap — swap volume routed through TartSwapRouterV2 on BNB Smart Chain.
 *
 * Why `aggregators/` and not `dexs/`: TartSwapRouterV2
 * (0xBd9Ab53ebfb53F4436c829E881B5e560868D840F, verified on BscScan) is a
 * fee-taking wrapper around the PancakeSwap V2 router. It has no factory and no
 * pairs, holds no liquidity, and forwards every swap to PancakeSwap after taking
 * its fee on the input leg. Its volume is therefore routed volume that already
 * appears in PancakeSwap's DEX volume; listing it under `dexs/` would double
 * count it. That is exactly the router/aggregator case.
 *
 * Source of truth: the router emits `TartSwapExecuted` on every swap with the
 * gross input (`amountIn`, before the router fee). `tokenIn == address(0)` means
 * the user paid native BNB. Fee-on-transfer variants emit `amountOut = 0`, so the
 * input side is the only leg that is always populated; volume is the gross input.
 */
const ROUTER = "0xBd9Ab53ebfb53F4436c829E881B5e560868D840F";

const TART_SWAP_EXECUTED =
  "event TartSwapExecuted(address indexed user, address indexed caller, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountInAfterFee, uint256 amountOut, uint256 feeAmount, uint16 feeBpsApplied, uint8 feeTier, bool feeOnTransferSupporting)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({ target: ROUTER, eventAbi: TART_SWAP_EXECUTED });
  for (const log of logs) {
    // address(0) = native BNB; the balances helper prices it as the gas token.
    dailyVolume.add(log.tokenIn, log.amountIn);
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Gross input amount (amountIn, before the TartSwap router fee) of every TartSwapExecuted event emitted by TartSwapRouterV2 on BNB Smart Chain. The router forwards the swap to PancakeSwap V2 and holds no liquidity of its own.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  // TART listing day; the router has been live since 2026-06, but volume before
  // the token launch was rehearsal-level and is not claimed.
  start: "2026-08-31",
  methodology,
};

export default adapter;

/**
 * DeFiLlama dimension-adapters — Accrued DEX aggregator volume (Robinhood Chain).
 *
 * Copy to: dimension-adapters/dexs/accrued.ts
 *
 * Category: DEX Aggregator (routes Uniswap liquidity; Accrued does not own pools).
 */
import type { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/** AccruedSwapRouter — https://robinhoodchain.blockscout.com/address/0xc78e883f87675e75334df4d341f6fcb0915ebf19 */
const ACCRUED_SWAP_ROUTER = "0xc78e883f87675e75334df4d341f6fcb0915ebf19";
/** Robinhood Chain USDG — 6 decimals — https://docs.robinhood.com/chain/contracts/ */
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
/** Robinhood Chain USDT — 6 decimals */
const USDT = "0xE246BC49b0598d7Cd9f0eAD48B885034f1254380";
/** Robinhood Chain WETH — 18 decimals */
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

/** Router deploy block on Robinhood mainnet (2026-09-10). */
const ROUTER_START_BLOCK = 59334164;

const ACCRUED_SWAP_ABI =
  "event AccruedSwap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)";

/**
 * Map stablecoin raw amounts to USD. USDG and USDT use 6 decimals on Robinhood Chain.
 */
function addStableUsdVolume(
  dailyVolume: ReturnType<FetchOptions["createBalances"]>,
  token: string,
  amount: bigint,
): boolean {
  const t = token.toLowerCase();
  if (t === USDG.toLowerCase() || t === USDT.toLowerCase()) {
    dailyVolume.add(token, Number(amount) / 1e6);
    return true;
  }
  return false;
}

/**
 * Sum AccruedSwap event notionals for the adapter window.
 * Prefers the stablecoin leg; otherwise prices tokenIn via DeFiLlama balances.
 */
async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: ACCRUED_SWAP_ROUTER,
    eventAbi: ACCRUED_SWAP_ABI,
    fromBlock: ROUTER_START_BLOCK,
  });

  for (const log of logs) {
    const tokenIn = String(log.tokenIn).toLowerCase();
    const tokenOut = String(log.tokenOut).toLowerCase();
    const amountIn = BigInt(log.amountIn);
    const amountOut = BigInt(log.amountOut);

    if (addStableUsdVolume(dailyVolume, tokenIn, amountIn)) continue;
    if (addStableUsdVolume(dailyVolume, tokenOut, amountOut)) continue;

    if (tokenIn === WETH.toLowerCase()) {
      dailyVolume.add(WETH, Number(amountIn) / 1e18);
      continue;
    }

    dailyVolume.add(tokenIn, Number(amountIn) / 1e18);
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-09-10",
  chains: [CHAIN.ROBINHOOD],
  methodology: {
    Volume:
      "Trading volume from AccruedSwap events emitted by AccruedSwapRouter on Robinhood Chain. " +
      "One event per user trade; internal Uniswap hops are not double-counted. " +
      "USD uses the stablecoin leg when present, otherwise DeFiLlama token pricing.",
  },
};

export default adapter;

/**
 * DeFiLlama dimension-adapters — Accrued DEX aggregator volume (Robinhood Chain).
 *
 * Copy to: dimension-adapters/dexs/accrued.ts
 * Register in dexs/index.ts exports.
 *
 * Category: DEX Aggregator (routes Uniswap liquidity; Accrued does not own pools).
 */
import type { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";

const ACCRUED_SWAP_ROUTER = "0xc78e883f87675e75334df4d341f6fcb0915ebf19";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const USDT = "0xE246BC49b0598d7Cd9f0eAD48B885034f1254380";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

/** Router deploy block on Robinhood mainnet — update if redeployed. */
const START_BLOCK = 59334164;

const ACCRUED_SWAP_ABI =
  "event AccruedSwap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)";

function stableUsdAmount(token: string, amount: bigint): number | null {
  const t = token.toLowerCase();
  if (t === USDG.toLowerCase() || t === USDT.toLowerCase()) {
    return Number(amount) / 1e6;
  }
  return null;
}

async function fetchAccruedVolume(options: FetchOptions): Promise<FetchResult> {
  const logs = await options.getLogs({
    target: ACCRUED_SWAP_ROUTER,
    eventAbi: ACCRUED_SWAP_ABI,
    fromBlock: START_BLOCK,
  });

  let dailyVolume = 0;

  for (const log of logs) {
    const tokenIn = String(log.tokenIn).toLowerCase();
    const tokenOut = String(log.tokenOut).toLowerCase();
    const amountIn = BigInt(log.amountIn);
    const amountOut = BigInt(log.amountOut);

    const inStable = stableUsdAmount(tokenIn, amountIn);
    const outStable = stableUsdAmount(tokenOut, amountOut);

    if (inStable != null) {
      dailyVolume += inStable;
      continue;
    }
    if (outStable != null) {
      dailyVolume += outStable;
      continue;
    }

    // WETH / majors: use DeFiLlama price helper when available
    if (tokenIn.toLowerCase() === WETH.toLowerCase()) {
      const ethPrice = await options.getUSDValue?.(WETH, amountIn);
      if (ethPrice != null) dailyVolume += ethPrice;
    }
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    robinhood: {
      start: START_BLOCK,
      fetch: fetchAccruedVolume,
      runAtCurrTime: true,
    },
  },
  methodology: {
    Volume:
      "Trading volume generated through Accrued on Robinhood Chain. Only swaps " +
      "emitting AccruedSwap from AccruedSwapRouter are included. One event per user trade; " +
      "internal Uniswap hops are not double-counted. USD uses stablecoin leg or token price oracles.",
  },
};

export default adapter;

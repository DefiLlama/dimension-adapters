import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/**
 * Fetches daily fees earned by xStocks (Backed Finance) liquidity pools on Raydium CLMM.
 * xStocks provides liquidity to Raydium concentrated liquidity pools for tokenized equities.
 * Fees are earned from trading volume in these pools at the configured fee rate.
 * Raydium CLMM fee split: 84% to LPs, 12% to Raydium protocol, 4% to treasury.
 */
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const isXStock = (sym: string) => /^[A-Z]{1,5}x$/.test(sym);

  let page = 1;
  const pageSize = 500;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api-v3.raydium.io/pools/info/list?poolType=concentrated&poolSortField=volume24h&sortType=desc&pageSize=${pageSize}&page=${page}`;
    const data = await fetchURL(url);
    const pools = data?.data?.data ?? [];

    if (pools.length === 0) { hasMore = false; break; }

    for (const pool of pools) {
      const symA: string = pool?.mintA?.symbol ?? '';
      const symB: string = pool?.mintB?.symbol ?? '';
      if (!isXStock(symA) && !isXStock(symB)) continue;

      const volume = pool?.day?.volume ?? 0;
      const feeRate = pool?.config?.tradeFeeRate ?? 0;
      const grossFeeUsd = pool?.day?.volumeFee ?? (volume * feeRate / 1_000_000);

      // Raydium CLMM split: 84% LP, 12% protocol, 4% treasury
      const lpFeeUsd = grossFeeUsd * 0.84;
      const protocolFeeUsd = grossFeeUsd * 0.16;

      dailyFees.addUSDValue(grossFeeUsd);
      dailyRevenue.addUSDValue(lpFeeUsd);
      dailySupplySideRevenue.addUSDValue(protocolFeeUsd);
    }

    // Pools sorted by volume desc — stop when last pool on page has zero volume
    const maxPageVolume = pools[pools.length - 1]?.day?.volume ?? 0;
    if (maxPageVolume === 0) { hasMore = false; break; }

    hasMore = pools.length === pageSize;
    page++;
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-06-30',
    }
  },
  methodology: {
    Fees: "Gross trading fees earned by xStocks liquidity pools on Raydium CLMM (volume × fee rate).",
    Revenue: "84% of gross fees go to xStocks as LP revenue.",
    SupplySideRevenue: "16% of gross fees go to Raydium protocol (12%) and treasury (4%).",
  }
};

export default adapter;

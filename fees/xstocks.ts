import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/**
 * Fetches daily fees earned by xStocks (Backed Finance) liquidity pools on Raydium CLMM.
 * xStocks provides liquidity to Raydium concentrated liquidity pools for tokenized equities.
 * Fees are earned from trading volume in these pools at the configured fee rate.
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

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
      if (!symA.endsWith('x') && !symB.endsWith('x')) continue;

      const volume = pool?.day?.volume ?? 0;
      const feeRate = pool?.config?.tradeFeeRate ?? 0;
      const dailyFeeUsd = volume * feeRate / 1_000_000;
      dailyFees.addUSDValue(dailyFeeUsd);
    }

    hasMore = pools.length === pageSize;
    page++;
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-06-30',
    }
  },
  methodology: {
    Fees: "Trading fees earned by xStocks liquidity pools on Raydium CLMM. Each pool charges a fee rate (0.01%-2%) on trading volume.",
    Revenue: "All LP trading fees go to liquidity providers (xStocks protocol).",
  }
};

export default adapter;

import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { PromisePool } from "@supercharge/promise-pool";

const API_BASE = "https://api.afx.xyz";
const DAILY_INTERVAL = 86400;

interface KlineCandle {
  timestamp: number;
  turnover: string;
}

interface ProductMeta {
  perpProducts: { symbol: string }[];
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  const { data: productMeta }: { data: ProductMeta } = await httpGet(`${API_BASE}/info/public/product-meta`);
  const symbols = productMeta.perpProducts.map((p) => p.symbol);

  const startTime = options.startOfDay;
  const endTime = startTime + DAILY_INTERVAL;

  const { results } = await PromisePool
    .withConcurrency(5)
    .for(symbols)
    .process(async (symbol) => {
      const res: { data: KlineCandle[] } = await httpGet(`${API_BASE}/info/kline/list?symbol_name=${symbol}&interval=${DAILY_INTERVAL}&startTime=${startTime}&endTime=${endTime}`);
      return res.data;
    });

  let totalTurnover = 0;
  for (const candles of results) {
    const match = candles.find((c) => c.timestamp === startTime);
    if (match) {
      totalTurnover += Number(match.turnover);
    }
  }

  dailyVolume.addUSDValue(totalTurnover);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AFX]: {
      fetch,
      start: "2026-05-12",
    },
  },
  methodology: {
    Volume: "Sum of daily turnover (notional volume in USD) across all perpetual trading pairs, sourced from AFX kline data.",
  },
};

export default adapter;

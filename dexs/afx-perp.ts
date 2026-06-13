import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";

const API_BASE = "https://api10.afx.xyz";
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

  const { data: productMeta }: { data: ProductMeta } = await fetchURLAutoHandleRateLimit(`${API_BASE}/info/public/product-meta`);
  if (!productMeta?.perpProducts) throw new Error("AFX: failed to fetch product meta");
  const symbols = productMeta.perpProducts.map((p) => p.symbol);

  const startTime = options.startOfDay;
  const endTime = startTime + DAILY_INTERVAL;

  let totalTurnover = 0;
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const res: { data: KlineCandle[] } = await fetchURLAutoHandleRateLimit(`${API_BASE}/info/kline/list?symbol_name=${symbol}&interval=${DAILY_INTERVAL}&startTime=${startTime}&endTime=${endTime}`);
    if (!Array.isArray(res?.data)) throw new Error(`AFX: invalid kline response for ${symbol}`);
    const match = res.data.find((c) => c.timestamp === startTime);
    if (match) {
      totalTurnover += Number(match.turnover);
    }
  }

  dailyVolume.addUSDValue(totalTurnover);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  // version 1: the kline API only serves daily aggregates (interval=86400, keyed off startOfDay)
  version: 1,
  fetch,
  chains: [CHAIN.AFX],
  start: "2026-05-12",
  methodology: {
    Volume: "Sum of daily turnover (notional volume in USD) across all perpetual trading pairs, sourced from AFX kline data.",
  },
};

export default adapter;

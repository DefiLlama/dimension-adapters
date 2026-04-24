import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PromisePool } from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const apiEndpoint = "https://perps.standx.com/api";

// NOTE: Take MM0 fee rate as reference to estimate trading fees
const PERPS_FEE_RATE = 0.0003;

interface SymbolInfo {
  symbol: string;
  status: string;
}

interface MarketInfo {
  s: string;
  t: number[];
  c: number[];
  o: number[];
  h: number[];
  l: number[];
  v: number[];
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const symbolsResponse: SymbolInfo[] = await fetchURL(`${apiEndpoint}/query_symbol_info`);
  const symbols = symbolsResponse.map((item) => item.symbol);

  await PromisePool.withConcurrency(1).for(symbols).process(async (symbol) => {
    const marketInfo: MarketInfo = await fetchURLAutoHandleRateLimit(
      `${apiEndpoint}/kline/history?symbol=${symbol}&from=${options.startOfDay}&to=${options.endTimestamp}&resolution=60&countback=50`,
    );
    const todaysDataPositions = marketInfo.t
      .map((t: number, i: number) => (t >= options.startOfDay && t < options.endTimestamp ? i : -1))
      .filter((i: number) => i >= 0);
    const volUsd = todaysDataPositions.reduce((acc: number, i: number) => acc + marketInfo?.v[i] * marketInfo?.c[i], 0);
    dailyFees.addUSDValue(volUsd * PERPS_FEE_RATE, METRIC.TRADING_FEES);
    await sleep(1000);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};


const methodology = {
  Fees: "Perps trading fees estimated as dailyVolume",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STANDX],
  start: '2025-11-24',
  methodology,
};

export default adapter;

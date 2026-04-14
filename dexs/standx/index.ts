import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PromisePool } from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";

const apiEndpoint = "https://perps.standx.com/api";

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

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();
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
    dailyVolume.addUSDValue(volUsd);
    await sleep(1000);
  });

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume: "Trading volume is calculated using standx OHLCV API",
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STANDX],
  start: '2025-11-24',
  methodology,
};

export default adapter;

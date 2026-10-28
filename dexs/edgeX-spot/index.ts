import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const SPOT_META_ENDPOINT = "https://spot.edgex.exchange/api/v1/public/meta/getMetaData";
const klineEndpoint = (instrumentId: string, startTime: number, endTime: number) =>
  `https://spot.edgex.exchange/api/v1/public/quote/getKline?instrumentId=${instrumentId}&klineType=DAY_1&filterBeginKlineTimeInclusive=${startTime}&filterEndKlineTimeExclusive=${endTime}&priceType=LAST_PRICE`;

const fetch = async (options: FetchOptions) => {
  const metadata = await fetchURL(SPOT_META_ENDPOINT);
  const symbols: { symbolId: string }[] = metadata.data.symbolList.filter((symbol: { enableTrade: boolean; enableDisplay: boolean }) => symbol.enableTrade && symbol.enableDisplay);
  const startTime = options.startOfDay * 1000;
  const endTime = options.endTimestamp * 1000;

  const { results } = await PromisePool.withConcurrency(2)
    .for(symbols)
    .process(async (symbol: { symbolId: string }) => {
      const response = await fetchURLAutoHandleRateLimit(klineEndpoint(symbol.symbolId, startTime, endTime));
      await sleep(500);
      return response.data.dataList.reduce((total: number, kline: { value: string }) => total + Number(kline.value), 0);
    });

  const volume = results.reduce((total: number, volume: number) => total + volume);

  return { dailyVolume: volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.EDGEX],
  start: "2025-12-11",
};

export default adapter;

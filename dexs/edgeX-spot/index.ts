import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const SPOT_META_ENDPOINT = "https://spot.edgex.exchange/api/v1/public/meta/getMetaData";
const klineEndpoint = (instrumentId: string, startTime: number, endTime: number) =>
  `https://spot.edgex.exchange/api/v1/public/quote/getKline?instrumentId=${instrumentId}&klineType=MINUTE_30&filterBeginKlineTimeInclusive=${startTime}&filterEndKlineTimeExclusive=${endTime}&priceType=LAST_PRICE`;

const fetch = async (options: FetchOptions) => {
  const metadata = await fetchURL(SPOT_META_ENDPOINT);
  const symbols = metadata.data.symbolList.filter((symbol: { enableTrade: boolean; enableDisplay: boolean }) => symbol.enableTrade && symbol.enableDisplay);

  let dailyVolume = 0;
  for (const symbol of symbols) {
    const response = await fetchURL(klineEndpoint(symbol.symbolId, options.startTimestamp * 1000, options.endTimestamp * 1000));
    dailyVolume += response.data.dataList.reduce((total: number, kline: { value: string }) => total + Number(kline.value), 0);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.EDGEX],
  start: "2025-12-11",
};

export default adapter;

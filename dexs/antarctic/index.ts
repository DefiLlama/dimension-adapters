import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

type V1TickerItem = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  open: number;
  close: number;
  low: number;
  high: number;
  amount: number;
  volume: number;
};

const volumeAPI = "https://prod-openapi.antarctic.exchange/futures/common/v1/perpetual/contracts";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = volumeAPI + "?timestamp=" + (options.startOfDay * 1000);
  const data = (await httpGet(url)) as { data: V1TickerItem[] };
  const dailyVolume = data.data.reduce((p, c) => p + +c.volume, 0);

  return { dailyVolume };
};

export default {
  fetch,
  start: "2025-05-10",
  runAtCurrTime: true,
  chains: [CHAIN.OFF_CHAIN],
};

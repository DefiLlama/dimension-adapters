import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";
import { httpGet } from "../../utils/fetchURL";

type ResponseItem = {
  symbol: string;
  baseAsset: string;
  qouteAsset: string;
  productType: string;
  lastPrice: number;
  low: number;
  high: number;
  baseVol: number;
  qutoVol: number;
  openInterest: number;
};

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

const volumeAPI =
  "https://prod-openapi.antarctic.exchange/futures/common/v1/perpetual/contracts";

const fetchVolume = async (timestamp: number) => {
  var url = volumeAPI + "?timestamp=" + timestamp;
  const data = (await httpGet(url)) as { data: V1TickerItem[] };
  const dailyVolume = data.data.reduce((p, c) => p + +c.volume, 0);

  return { dailyVolume, };
};

const fetch = async (timestamp: number) => {
  let dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  dayTimestamp = (dayTimestamp) * 1000;
  const dailyVolume = (await fetchVolume(dayTimestamp))?.dailyVolume;

  return { dailyVolume, };
};

export default {
  fetch,
  start: "2025-05-10",
  runAtCurrTime: true,
  chains: [CHAIN.OFF_CHAIN],
};

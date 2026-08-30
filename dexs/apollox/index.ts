import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
  baseVolume: number;
  quoteVolume: number;
  openInterest: number;
};

const v2VolumeAPI =
  "https://www.apollox.finance/bapi/future/v1/public/future/apx/pair";

const v1VolumeAPI =
  "https://www.apollox.finance/bapi/future/v1/public/future/aster/ticker/pair";

async function sleep(time: number) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), time));
}
let sleepCount = 0;

const fetchV2Volume = async (options: FetchOptions, retry = 0) => {
  if (retry >= 3) {
    throw new Error("Failed to fetch v2 volume after 3 retries");
  }
  // This is very important!!! because our API will throw error when send >=2 requests at the same time.
  await sleep(sleepCount++ * 2 * 1e3);

  const res = (await httpGet(v2VolumeAPI, {
    params: { excludeCake: true },
  })) as { data: ResponseItem[]; success: boolean };
  const dailyVolume = options.createBalances()
  if (res.data === null && res.success === false) {
    return fetchV2Volume(options, retry + 1);
  }
  res.data.forEach(row => {
    dailyVolume.addUSDValue(row.qutoVol, {id: row.baseAsset, isUSDValue: true} )
  })
  return { dailyVolume, };
};

const fetchV1Volume = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const data = (await httpGet(v1VolumeAPI)) as { data: V1TickerItem[] };
    data.data.forEach(row => {
    dailyVolume.addUSDValue(row.quoteVolume, {id: row.baseAsset, isUSDValue: true} )
  })
  return { dailyVolume, };
};

const fetch = async (options: FetchOptions) => {
  const v1DailyVolume = await fetchV1Volume(options);

  const v2DailyVolume = await fetchV2Volume(options);

  const dailyVolume = v2DailyVolume.dailyVolume
  dailyVolume.addBalances(v1DailyVolume.dailyVolume)
  const usdValue = await dailyVolume.getUSDValue()
  if (usdValue >= 35_000_000_000) {
    console.log("Daily volume is greater than 35 billion", dailyVolume);
    throw new Error("Daily volume is too high, something went wrong");
  }

  return { dailyVolume, };
};

export default {
  fetch,
  start: "2023-04-21",
  runAtCurrTime: true,
  chains: [CHAIN.OFF_CHAIN],
};

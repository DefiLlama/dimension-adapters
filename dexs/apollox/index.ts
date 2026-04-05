import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { tickerToCgId } from "../../helpers/coingeckoIds";
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

function addVolume(balance: Balances, baseAsset: string, baseVol: number, quoteVol: number) {
  const cgId = tickerToCgId[baseAsset]
  if (cgId) {
    balance.addCGToken(cgId, baseVol)
  } else {
    balance.addUSDValue(quoteVol)
  }
}

const fetchV2Volume = async (balance: Balances, retry = 0) => {
  if (retry >= 3) {
    throw new Error("Failed to fetch v2 volume after 3 retries");
  }
  // This is very important!!! because our API will throw error when send >=2 requests at the same time.
  await sleep(sleepCount++ * 2 * 1e3);

  const res = (await httpGet(v2VolumeAPI, {
    params: { excludeCake: true },
  })) as { data: ResponseItem[]; success: boolean };
  if (res.data === null && res.success === false) {
    return fetchV2Volume(balance, retry + 1);
  }
  for (const item of (res.data || [])) {
    addVolume(balance, item.baseAsset, item.baseVol, item.qutoVol)
  }
};

const fetchV1Volume = async (balance: Balances) => {
  const data = (await httpGet(v1VolumeAPI)) as { data: V1TickerItem[] };
  for (const item of data.data) {
    addVolume(balance, item.baseAsset, item.baseVolume, item.quoteVolume)
  }
};

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  await fetchV1Volume(dailyVolume);
  await fetchV2Volume(dailyVolume);
  if (await dailyVolume.getUSDValue() >= 35_000_000_000) {
    console.log("Daily volume is greater than 35 billion", dailyVolume);
    throw new Error("Daily volume is too high, something went wrong");
  }
  return { dailyVolume };
};

export default {
  fetch,
  start: "2023-04-21",
  runAtCurrTime: true,
  chains: [CHAIN.OFF_CHAIN],
};

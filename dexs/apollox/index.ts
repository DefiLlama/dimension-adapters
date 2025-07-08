import { Chain } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
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
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
};

const v2VolumeAPI =
  "https://www.apollox.finance/bapi/future/v1/public/future/apx/pair";

const v1VolumeAPI = "https://www.apollox.finance/fapi/v1/ticker/24hr";

async function sleep (time: number) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), time))
}
let sleepCount = 0
const fetchV2Volume = async (chain: Chain) => {
  // This is very important!!! because our API will throw error when send >=2 requests at the same time.
  await sleep(sleepCount++ * 2 * 1e3)
  const res = (
    await httpGet(v2VolumeAPI, { params: { chain, excludeCake: true } })
  ) as  { data: ResponseItem[], success: boolean }
  if (res.data === null && res.success === false) {
    return fetchV2Volume(chain)
  }
  const dailyVolume = (res.data || []).reduce((p, c) => p + +c.qutoVol, 0);

  return dailyVolume
};

const fetchV1Volume = async () => {
  const data = (await httpGet(v1VolumeAPI)) as V1TickerItem[];
  const dailyVolume = data.reduce((p, c) => p + +c.quoteVolume, 0);

  return dailyVolume
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      runAtCurrTime: true,
      fetch: async () => {
        const [v1, v2,] = await Promise.all([
          fetchV2Volume(CHAIN.BSC),
          fetchV1Volume(),
        ]);
        return {
          dailyVolume: v1 + v2,
        };
      },
      start: '2023-04-21',
    },
    [CHAIN.ARBITRUM]: {
      fetch: async () => {
        const [v2] = await Promise.all([
          fetchV2Volume(CHAIN.ARBITRUM),
        ]);
        return {
          dailyVolume: v2,
        };
      },
      start: '2023-04-21',
    },
    [CHAIN.OP_BNB]: {
      fetch: async () => {
        const [v2] = await Promise.all([
          fetchV2Volume('opbnb'),
        ]);
        return {
          dailyVolume: v2,
        };
      },
      start: '2023-04-21',
    },
    [CHAIN.BASE]: {
      fetch: async () => {
        const [v2,] = await Promise.all([
          fetchV2Volume(CHAIN.BASE),
        ]);
        return {
          dailyVolume: v2,
        };
      },
      start: '2023-04-21',
    },
  },
};

export default adapter;

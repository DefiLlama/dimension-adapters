import { Chain } from "@defillama/sdk/build/general";
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

type TotalVolumeItem = {
    "alpFeeVOFor24Hour": {
      "fee": number
      "revenue": number
    },
    "allAlpFeeVO": {
      "fee": number
      "revenue": number
    },
    "cumVol": number
}

const TotalVolumeAPI =  "https://www.apollox.finance/bapi/futures/v1/public/future/apx/fee/all"

const v2VolumeAPI =
  "https://www.apollox.finance/bapi/future/v1/public/future/apx/pair";

const v1VolumeAPI = "https://www.apollox.finance/fapi/v1/ticker/24hr";

const fetchV2Volume = async (chain: Chain) => {
  const { data = [] } = (
    await httpGet(v2VolumeAPI, { params: { chain, excludeCake: true } })
  ) as  { data: ResponseItem[] }
  const dailyVolume = data.reduce((p, c) => p + +c.qutoVol, 0);

  return dailyVolume
};

const fetchV1Volume = async () => {
  const data = (await httpGet(v1VolumeAPI)) as V1TickerItem[];
  const dailyVolume = data.reduce((p, c) => p + +c.quoteVolume, 0);

  return dailyVolume
};

const fetchTotalVolume = async (chain: Chain) => {
  const { data  } = (
    await httpGet(TotalVolumeAPI, { params: { chain,  } })
  ) as  { data: TotalVolumeItem }

  return data.cumVol
};
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      runAtCurrTime: true,
      fetch: async (timestamp) => {
        const [v1, v2, totalVolume] = await Promise.all([
          fetchV2Volume(CHAIN.BSC),
          fetchV1Volume(),
          fetchTotalVolume(CHAIN.BSC),
        ]);
        return {
          dailyVolume: v1 + v2,
          totalVolume,
          timestamp,
        };
      },
      start: 1682035200,
    },
    [CHAIN.ARBITRUM]: {
      runAtCurrTime: true,
      fetch: async (timestamp) => {
        const [v2, totalVolume] = await Promise.all([
          fetchV2Volume(CHAIN.ARBITRUM),
          fetchTotalVolume(CHAIN.ARBITRUM),
        ]);
        return {
          timestamp,
          dailyVolume: v2,
          totalVolume,
        };
      },
      start: 1682035200,
    },
    [CHAIN.OP_BNB]: {
      runAtCurrTime: true,
      fetch: async (timestamp) => {
        const [v2, totalVolume] = await Promise.all([
          fetchV2Volume('opbnb'),
          fetchTotalVolume('opbnb'),
        ]);
        return {
          timestamp,
          dailyVolume: v2,
          totalVolume,
        };
      },
      start: 1682035200,
    },
    [CHAIN.BASE]: {
      runAtCurrTime: true,
      fetch: async (timestamp) => {
        const [v2, totalVolume] = await Promise.all([
          fetchV2Volume(CHAIN.BASE),
          fetchTotalVolume(CHAIN.BASE),
        ]);
        return {
          timestamp,
          dailyVolume: v2,
          totalVolume,
        };
      },
      start: 1682035200,
    },
  },
};

export default adapter;

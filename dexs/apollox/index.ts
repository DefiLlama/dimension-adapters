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

type TotalVolumeV1AndV2ForBscItem = {
  "openInterestTotal": string
  "totalUser": string
  "v1TotalVolume": string
  "v2TotalVolume": string
}


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

const TotalVolumeV1AndV2ForBscAPI = "https://fapi.apollox.finance/fapi/v1/openInterestAndTrader"
const TotalVolumeAPI =  "https://www.apollox.finance/bapi/futures/v1/public/future/apx/fee/all"

const v2VolumeAPI =
  "https://www.apollox.finance/bapi/future/v1/public/future/apx/pair";

const v1VolumeAPI = "https://www.apollox.finance/fapi/v1/ticker/24hr";

const fetchV2Volume = async (chain: Chain) => {
  const url = `${v2VolumeAPI}?chain=${chain}&excludeCake=true`;
  const { data = [] } = (
    await httpGet(url)
  ) as  { data: ResponseItem[] }
  if (!data) {
    return 0;
  }
  const dailyVolume = data.reduce((p, c) => p + +c.qutoVol, 0);

  return dailyVolume
};

const fetchV1Volume = async () => {
  const data = (await httpGet(v1VolumeAPI)) as V1TickerItem[];
  const dailyVolume = data.reduce((p, c) => p + +c.quoteVolume, 0);

  return dailyVolume
};

const fetchTotalVolumeV1AndV2ForBSC = async () => {
  const data = (
    await httpGet(TotalVolumeV1AndV2ForBscAPI)
  ) as  TotalVolumeV1AndV2ForBscItem
  return { v1: Number(data.v1TotalVolume), v2: Number(data.v2TotalVolume) }
};

const fetchTotalV2Volume = async (chain: Chain) => {
  const { data  } = (
    await httpGet(TotalVolumeAPI, { params: { chain,  } })
  ) as  { data: TotalVolumeItem }

  return Number(data.cumVol)
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      // runAtCurrTime: true,
      fetch: async (timestamp) => {
        const [v1, v2, totalV2Volume, { v1 : totalV1Volume }] = await Promise.all([
          fetchV2Volume(CHAIN.BSC),
          fetchV1Volume(),
          fetchTotalV2Volume(CHAIN.BSC),
          fetchTotalVolumeV1AndV2ForBSC()
        ]);
        return {
          dailyVolume: v1 + v2,
          totalVolume: totalV1Volume + totalV2Volume,
          timestamp,
        };
      },
      start: 1682035200,
    },
    [CHAIN.ARBITRUM]: {
      // runAtCurrTime: true,
      fetch: async (timestamp) => {
        const [v2, totalVolume] = await Promise.all([
          fetchV2Volume(CHAIN.ARBITRUM),
          fetchTotalV2Volume(CHAIN.ARBITRUM),
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
      // runAtCurrTime: true,
      fetch: async (timestamp) => {
        const [v2, totalVolume] = await Promise.all([
          fetchV2Volume('opbnb'),
          fetchTotalV2Volume('opbnb'),
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
      // runAtCurrTime: true,
      fetch: async (timestamp) => {
        const [v2, totalVolume] = await Promise.all([
          fetchV2Volume(CHAIN.BASE),
          fetchTotalV2Volume(CHAIN.BASE),
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

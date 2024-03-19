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

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: async (timestamp) => {
        const [v1, v2] = await Promise.all([
          fetchV2Volume(CHAIN.BSC),
          fetchV1Volume(),
        ]);
        return {
          dailyVolume: v1 + v2,
          timestamp,
        };
      },
      start: 1682035200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: async (timestamp) => {
        const dailyVolume = await fetchV2Volume(CHAIN.ARBITRUM);
        return {
          timestamp,
          dailyVolume: dailyVolume,
        };
      },
      start: 1682035200,
    },
    [CHAIN.OP_BNB]: {
      fetch: async (timestamp) => {
        const dailyVolume = await fetchV2Volume('opbnb');
        return {
          timestamp,
          dailyVolume: dailyVolume,
        };
      },
      start: 1682035200,
    },
    [CHAIN.BASE]: {
      fetch: async (timestamp) => {
        const dailyVolume = await fetchV2Volume(CHAIN.BASE);
        return {
          timestamp,
          dailyVolume: dailyVolume,
        };
      },
      start: 1682035200,
    },
  },
};

export default adapter;

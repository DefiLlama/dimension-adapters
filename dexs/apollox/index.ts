import axios from "axios";
import BigNumber from "bignumber.js";
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
  try {
    const { data = [] } = (
      await axios.get(v2VolumeAPI, { params: { chain, excludeCake: true } })
    ).data as { data: ResponseItem[] };

    const dailyVolume = data.reduce(
      (p, c) => p.plus(c.qutoVol),
      new BigNumber(0)
    );

    return dailyVolume.toString();
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const fetchV1Volume = async () => {
  const data = (await axios.get(v1VolumeAPI)).data as V1TickerItem[];
  const dailyVolume = data.reduce(
    (p, c) => p.plus(c.quoteVolume),
    new BigNumber(0)
  );

  return dailyVolume.toString();
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: async (timestamp) => {
        const [v2DailyVolume, v1DailyVolume] = await Promise.allSettled([
          fetchV2Volume(CHAIN.BSC),
          fetchV1Volume(),
        ]);

        const v1 =
          v1DailyVolume.status === "fulfilled"
            ? new BigNumber(v1DailyVolume.value)
            : new BigNumber(0);

        const v2 =
          v2DailyVolume.status === "fulfilled"
            ? new BigNumber(v2DailyVolume.value)
            : new BigNumber(0);

        return {
          dailyVolume: v1.plus(v2).toString(),
          timestamp,
        };
      },
      start: async () => 1682035200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: async (timestamp) => {
        const dailyVolume = await fetchV2Volume(CHAIN.ARBITRUM);
        return {
          timestamp,
          dailyVolume,
        };
      },
      start: async () => 1682035200,
    },
  },
};

export default adapter;

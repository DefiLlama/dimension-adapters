import axios from "axios";
import BigNumber from 'bignumber.js'
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type ResponseItem = {
  symbol: string
  baseAsset: string
  qouteAsset: string
  productType: string
  lastPrice: number
  low: number
  high: number
  baseVol: number
  qutoVol: number
  openInterest: number
}

const VolumeAPI = 'https://www.apollox.finance/bapi/future/v1/public/future/apx/pair'

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number) => {
    try {
      const { data = [] } = (await axios.get(VolumeAPI, { params: { chain } })).data as { data: ResponseItem[]};
      const dailyVolume = data.reduce((p, c) => p.plus(c.qutoVol), new BigNumber(0))

      return {
        dailyVolume: dailyVolume.toString(),
        timestamp,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume(CHAIN.BSC),
      start: async () => 1682035200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume(CHAIN.ARBITRUM),
      start: async () => 1682035200,
    },
  },
};

export default adapter;

import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://pabc.endjgfsv.link/swapv2/scan/getAllLiquidityVolume"

interface IVolumeall {
  volume: string;
  time: number;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data;
  const dailyVolume = historicalVolume
    .find(dayItem =>dayItem.time === options.startOfDay)?.volume

  return {
    dailyVolume: dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TRON]: {
      fetch,
      start: '2021-12-14',
    },
  },
};

export default adapter;

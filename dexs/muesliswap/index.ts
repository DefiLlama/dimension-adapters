import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

interface IVolumeall {
  time: number;
  volume: number;
};

const historicalVolumeEndpoint = "https://analyticsv3.muesliswap.com/historical-volume";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const totalVolume = options.createBalances();
  const vols: IVolumeall[] = (await httpGet(historicalVolumeEndpoint));
  vols
    .filter((volItem: IVolumeall) => Number(volItem.time) <= options.startOfDay)
    .map(({ volume }) => totalVolume.addGasToken(volume));
  dailyVolume.addGasToken(vols.find(dayItem => dayItem.time === options.startOfDay)?.volume)

  return {
    dailyVolume,
  }
}

export default {
  adapter: {
    // [CHAIN.MILKOMEDA]: {  // milkomeda chain is dead
    //   fetch: async (options: FetchOptions) => getUniV2LogAdapter({ factory: '0x57A8C24B2B0707478f91D3233A264eD77149D408'})(options)
    // },
    [CHAIN.CARDANO]: {
      fetch,
    }
  },
};

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";
import { ChainBlocks, FetchOptions } from "../../adapters/types";

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
    timestamp: options.startOfDay,
    dailyVolume,
    // totalVolume,
  }
}

const adapters = (() => {
  const milkomeda = univ2Adapter({
      [CHAIN.MILKOMEDA]: "https://milkomeda.muesliswap.com/graph/subgraphs/name/muesliswap/exchange"
    }, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
  });

  milkomeda.adapter[CHAIN.CARDANO] = {
    start: 1638057600,
    fetch: fetch,
  };
  return milkomeda;
})();


adapters.adapter.milkomeda.start = 1648427924;
export default adapters;

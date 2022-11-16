import axios from "axios";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp, univ2Adapter } from "../../helpers/getUniSubgraphVolume";


interface IVolumeall {
  time: number;
  volume: number;
};

const historicalVolumeEndpoint = "https://analyticsv3.muesliswap.com/historical-volume";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp*1000))
  const vols: IVolumeall[] = (await axios.get(historicalVolumeEndpoint))?.data;
  const totalVolume = vols
    .filter((volItem: IVolumeall) => Number(volItem.time) <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0);
  const dailyVolume = vols
    .find((dayItem: IVolumeall) => Number(dayItem.time) === dayTimestamp)?.volume
  const prices = await axios.post('https://coins.llama.fi/prices', {
    "coins": [
      "coingecko:cardano",
    ],
    timestamp: dayTimestamp
  });
  return {
    timestamp: dayTimestamp,
    totalVolume: totalVolume ? String(totalVolume/1e6 * prices.data.coins["coingecko:cardano"].price) : "0",
    dailyVolume: dailyVolume ? String(dailyVolume/1e6 * prices.data.coins["coingecko:cardano"].price) : "0"
  }
}

const adapters = (() => {
  const milkomeda = univ2Adapter({
      [CHAIN.MILKOMEDA]: "https://milkomeda.muesliswap.com/graph/subgraphs/name/muesliswap/exchange"
    }, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
  });

  milkomeda.adapter[CHAIN.CARDADO] = {
    start: async () => 1638057600,
    fetch: fetch,
  };
  return milkomeda;
})();


adapters.adapter.milkomeda.start = async () => 1648427924;
export default adapters;

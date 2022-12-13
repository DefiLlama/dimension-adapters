import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";

const historicalVolumeEndpoint = "https://stats.sundaeswap.finance/api/defillama/v0/global-stats/2100"

interface IVolumeall {
  volumeLovelace: number;
  day: string;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.response;
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.day).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { volumeLovelace }) => acc + Number(volumeLovelace), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.day)) === dayTimestamp)?.volumeLovelace

    const prices = await axios.post("https://coins.llama.fi/prices", {
    "coins": [
      "coingecko:cardano",
    ],
    timestamp: dayTimestamp
  });

  return {
    totalVolume: totalVolume ? String(Number(totalVolume) / 1e6 * prices.data.coins["coingecko:cardano"].price) : "0",
    dailyVolume: dailyVolume ? String(Number(dailyVolume) / 1e6 * prices.data.coins["coingecko:cardano"].price) : "0",
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CARDADO]: {
      fetch,
      start: async () => 1643673600,
    },
  },
};

export default adapter;

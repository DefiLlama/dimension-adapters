import fetchURL from "../../utils/fetchURL"
import { DISABLED_ADAPTER_KEY, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";
import disabledAdapter from "../../helpers/disabledAdapter";

const historicalVolumeEndpoint = "https://stats.sundaeswap.finance/api/defillama/v0/global-stats/2100"

interface IVolumeall {
  volumeLovelace: number;
  day: string;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.response;

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.day)) === dayTimestamp)?.volumeLovelace

    const prices = await axios.post("https://coins.llama.fi/prices", {
    "coins": [
      "coingecko:cardano",
    ],
    timestamp: dayTimestamp
  });

  return {
    dailyVolume: dailyVolume ? String(Number(dailyVolume) / 1e6 * prices.data.coins["coingecko:cardano"].price) : "0",
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.CARDADO]: {
      fetch,
      start: async () => 1643673600,
    },
  },
};

export default adapter;

import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.hydradx.io/defillama/v1/volume"

type IAPIResponse = {
  volume_usd: number;
}[];

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL)).data;
  const dailyVolume = response[0].volume_usd;

  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: async () => 1692748800,
    },
  }
};

export default adapter;

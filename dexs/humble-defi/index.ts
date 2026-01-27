import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://free-api.vestige.fi/pools/H2/volumes?currency=USD"

interface IAPIResponse {
  volume24h: string;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse[] = (await fetchURL(URL));
  const dailyVolume = response
    .reduce((acc, { volume24h }) => acc + Number(volume24h), 0)

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: '2025-06-01',
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch,
      runAtCurrTime: true,
    },
  }
};

export default adapter;

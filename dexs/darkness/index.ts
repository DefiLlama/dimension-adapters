import fetchURL from "../../utils/fetchURL"
import { DISABLED_ADAPTER_KEY, type SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";


const URL = "https://api.darkcrypto.finance/api/darkness"

interface IAPIResponse {
  volume24h: number;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL))?.data;
  const dailyVolume = response.volume24h;

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.CRONOS]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 1672790400,
    },
  }
};

export default adapter;

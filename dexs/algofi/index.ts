import fetchURL from "../../utils/fetchURL"
import { DISABLED_ADAPTER_KEY, type SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

const URL = "https://api.algofi.org/protocolStats"

interface IAPIResponse {
  total_usd: number;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL)).amm.volume.day;

  return {
    dailyVolume: `${response}`,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ALGORAND]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
    },
  }
};

export default adapter;

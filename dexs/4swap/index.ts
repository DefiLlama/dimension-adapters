import fetchURL from "../../utils/fetchURL"
import { DISABLED_ADAPTER_KEY, type SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

const URL = "https://mtgswap-api.fox.one/api/pairs"

interface IAPIResponse {
  volume_24h: string;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse[] = (await fetchURL(URL))?.data.pairs;
  const dailyVolume = response
    .reduce((acc, { volume_24h }) => acc + Number(volume_24h), 0);

  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.MIXIN]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
    },
  }
};

export default adapter;

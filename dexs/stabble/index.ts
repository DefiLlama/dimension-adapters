import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";

const volumeURL = "https://api.stabble.org/stats/volume";

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(
    options.endTimestamp
  );

  const url = `${volumeURL}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const dailyVolume = await fetchURL(url);

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: 1717563162,
    },
  },
};

export default adapter;

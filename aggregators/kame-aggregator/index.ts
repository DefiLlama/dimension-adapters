import fetchURL from "../../utils/fetchURL";
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.kame.ag/api/statistics";

const fetch: FetchV2 = async ({ fromTimestamp, toTimestamp }) => {
  const response = await fetchURL(
    `${URL}/?startTime=${fromTimestamp}&endTime=${toTimestamp}`
  );
  return { dailyVolume: response.volume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: "2025-04-17",
      runAtCurrTime: true,
    },
  },
};

export default adapter;

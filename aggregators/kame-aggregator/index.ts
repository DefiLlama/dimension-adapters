
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.kame.ag/api/statistics";

const fetch = async ({ fromTimestamp, toTimestamp }) => {
  const response = await fetchURL(`${URL}/?startTime=${fromTimestamp}&endTime=${toTimestamp}`);
  return { dailyVolume: response.volume };
};

export default {
  version: 2,
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: "2025-04-14",
    },
  },
}

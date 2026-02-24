import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.kame.ag/api/statistics";

const fetch = async ({ fromTimestamp, toTimestamp }) => {
  const response = await fetchURL(`${URL}/?startTime=${fromTimestamp}&endTime=${toTimestamp}`);
  const volume = response.volume > 25_000_000 ? 0 : response.volume; // quick fix to avoid random api inflated issue
  return { dailyVolume: volume };
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

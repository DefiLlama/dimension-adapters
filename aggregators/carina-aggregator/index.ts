import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const URL = "https://core.carina.finance/v1/orders/volume";

const fetch = async ({ fromTimestamp, toTimestamp }) => {
  const response = await fetchURL(`${URL}?startTimestamp=${fromTimestamp}&endTimestamp=${toTimestamp}`);
  return { dailyVolume: response.data.volume };
};

export default {
  version: 2,
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: "2025-11-03",
    },
  },
}

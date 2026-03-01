import fetchURL from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://core.carina.finance/v1/orders/volume";

const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const response = await fetchURL(
    `${URL}?startTimestamp=${fromTimestamp}&endTimestamp=${toTimestamp}`,
  );
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
};

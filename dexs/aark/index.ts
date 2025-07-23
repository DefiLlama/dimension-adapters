import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const endpoint = "https://public-api.aark.digital/stats/volume/futures";

const fetch = async (timestamp: number) => {
  const res = await fetchURL(`${endpoint}/${timestamp}`)

  return {
    dailyVolume: res.data.dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-08-12',
    },
  },
};

export default adapter;

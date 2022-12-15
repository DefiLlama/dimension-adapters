import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

const endpoint = "https://statistics-api.emdx.io/volume";

const fetch = async (timestamp: number) => {
  const response = await axios.get(`${endpoint}?date=${timestamp}`);

  return {
    timestamp: timestamp,
    dailyVolume: `${response?.data?.volume || 0}`,
    totalVolume: `${response?.data?.cumulative_volume || 0}`,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: async () => 1653134400
    },
  }
}

export default adapter;

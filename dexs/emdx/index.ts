import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

const endpoint = "https://api.emdx.io/api/v1/markets/full?chainId=43114";

const fetch = async (timestamp: number) => {
  const response: any[] = (await axios.get(endpoint, { headers: {'origin': 'https://emdx.io'}})).data.data.results;
  const dailyVolume = response.map((e: any) => e.data24hs.volume24hs)
    .reduce((a: number, b: number) => a+b,0)

  return {
    timestamp: timestamp,
    dailyVolume: `${dailyVolume|| 0}`,
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

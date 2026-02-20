import fetchURL from "../../utils/fetchURL"
import { type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.algofi.org/protocolStats"

interface IAPIResponse {
  total_usd: number;
};

const fetch = async (timestamp: number) => {
  const response: IAPIResponse = (await fetchURL(URL)).amm.volume.day;

  return {
    dailyVolume: response.toString(),
  };
};

const adapter: SimpleAdapter = {
  deadFrom: '2023-07-09',
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch,
      runAtCurrTime: true,
    },
  }
};

export default adapter;

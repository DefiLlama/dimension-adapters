import { SimpleAdapter } from "../../adapters/types";

import fetchURL from "../../utils/fetchURL"

const endpoints: { [chain: string]: string } = {
  bsc: "https://api.ellipsis.finance/api/getAll",
};

interface IAPIResponse {
  success: boolean
  getVolume: {
    total: string,
    day: string,
    generatedTimeMs: number
  }
}

const fetch = (chain: string) => async () => {
  const response: IAPIResponse = (await fetchURL(endpoints[chain])).data;
  return {
    dailyVolume: `${response.getVolume.day}`,
    totalVolume: `${response.getVolume.total}`,
    timestamp: Math.trunc(response.getVolume.generatedTimeMs / 1000),
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain),
        start: 0,
        runAtCurrTime: true
      }
    }
  }, {})
};
export default adapter;

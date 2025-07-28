
import fetchURL from "../../utils/fetchURL"
import { type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://backend.prophet.fun/business-metrics/daily-volume"


const fetch = async (timestamp: any) => {
  const data = await fetchURL(URL + "?timestamp=" + timestamp.startOfDay);

  return {
    dailyVolume: data.dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: 'Volume of all trades that go through the protocol',
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-07-24'
    },
  }
};

export default adapter;


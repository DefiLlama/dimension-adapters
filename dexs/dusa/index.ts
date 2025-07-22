import { Adapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

type TEndpoint = {
  [s: string]: string;
};

const endpoints: TEndpoint = {
  ["massa"]: "https://api-mainnet-dusa.up.railway.app/api/volume",
};

const fetch = async (options: FetchOptions) => {
  const historicalVolume = await fetchURL(`${endpoints["massa"]}?take=${options.endTimestamp}`);

  const dailyVolume = historicalVolume.dailyVolume.volume;
  const dailyFees = historicalVolume.dailyVolume.fees;

  return {
    dailyVolume: dailyVolume,
    dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    massa: {
      fetch,
      start: '2024-04-15'
    },
  }
}

export default adapter;

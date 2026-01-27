import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://waves.exchange/api/v1/liquidity_pools/stats"

interface IVolume {
  interval: string;
  quote_volume: string;
};

interface IAPIResponse {
  volumes: IVolume[];
};

const fetch = async (timestamp: number) => {
  const response: IAPIResponse[] = (await fetchURL(URL)).items;
  const dailyVolume = response.map(e => e.volumes.filter(p => p.interval === "1d")
    .map(x => x)).flat()
    .filter((e: IVolume) => Number(e.quote_volume) < 1_000_000)
    .reduce((a: number, b: IVolume) => a + Number(b.quote_volume) , 0);

  return {
    dailyVolume: dailyVolume,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.WAVES]: {
      fetch,
      runAtCurrTime: true,
          },
  }
};

export default adapter;

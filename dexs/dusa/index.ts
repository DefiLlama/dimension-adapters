import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type TEndpoint = {
  [s: string]: string;
};

const endpoints: TEndpoint = {
  ["massa"]: "https://api-mainnet-dusa.up.railway.app/api/volume",
};

const fetchVolume = async (timestamp: number) => {
  const historicalVolume = await fetchURL(endpoints["massa"]);

  const totalVolume = historicalVolume.totalVolume.volume; 
  const dailyVolume = historicalVolume.dailyVolume.volume;


  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume !== undefined ? `${dailyVolume}` : undefined,
    timestamp: timestamp,
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.MASSA]: {
      fetch: fetchVolume,
      runAtCurrTime: true,
      start: 1713170000
    },
  }
}

export default adapter;
import { Adapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

type TEndpoint = {
  [s: string]: string;
};

const fetchVolume = async (timestamp: number) => {

  const fromTimestamp = timestamp - 86400;
  const endpoints: TEndpoint = {
    ["massa"]: `https://api-mainnet-dusa.up.railway.app/api/volume?take=${fromTimestamp}`,
  };

  const historicalVolume = await fetchURL(endpoints.massa);
  const totalVolume = historicalVolume.totalVolume.volume; 
  const dailyVolume = historicalVolume.dailyVolume.volume;
  
  const dailyFees = historicalVolume.dailyVolume.fees;
  const totalFee = historicalVolume.totalVolume.fees;

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume !== undefined ? `${dailyVolume}` : undefined,
    dailyFees: `${dailyFees}`,
    totalFees: `${totalFee}`,
    timestamp: fromTimestamp,
  };
};

const adapter: Adapter = {
  adapter: {
    massa: {
      fetch: fetchVolume,
      runAtCurrTime: true,
      start: 1713170000
    },
  }
}

export default adapter;
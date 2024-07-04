import { Adapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

type TEndpoint = {
  [s: string]: string;
};

const endpoints: TEndpoint = {
  ["massa"]: "https://api-mainnet-dusa.up.railway.app/api/volume",
};

const fetchVolume = async (options: FetchOptions) => {
  const historicalVolume = await fetchURL(`${endpoints["massa"]}?take=${options.endTimestamp}`);

  const totalVolume = historicalVolume.totalVolume.volume;
  const dailyVolume = historicalVolume.dailyVolume.volume;

  const dailyFees = historicalVolume.dailyVolume.fees;
  const totalFee = historicalVolume.totalVolume.fees;

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume !== undefined ? `${dailyVolume}` : undefined,
    dailyFees: `${dailyFees}`,
    totalFees: `${totalFee}`,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    massa: {
      fetch: fetchVolume,
      start: 1713170000
    },
  }
}

export default adapter;

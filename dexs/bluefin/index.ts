import { start } from "repl";
import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
interface Volume {
  totalVolume: string | undefined;
  dailyVolume: string | undefined;
  timestamp: number;
}

const computeVolume = async (
  startTime: number,
  endTime: number
): Promise<Volume> => {
  const dailyVolume = (
    await httpGet(
      `https://dapi.api.sui-prod.bluefin.io/marketData/volume?startTime=${startTime}&&endTime=${endTime}`
    )
  ).volume;

  return {
    totalVolume: undefined,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: endTime/1000,
  };
};

const fetchSUI = async (timeStamp: number) => {
  return await computeVolume((timeStamp - 86399) * 1000, timeStamp * 1000); //endpoint expects time in ms
};

const startTime = 1695600000; // 25th September when SUI trading starts

const adapter: BreakdownAdapter = {
  breakdown: {
    derivatives: {
      [CHAIN.SUI]: {
        fetch: fetchSUI,
        start: startTime,
        runAtCurrTime: false,
      },
    },
  },
};

export default adapter;

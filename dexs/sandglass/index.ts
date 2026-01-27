import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const historicalVolumeEndpoint = "https://api.sandglass.so/dashboard/volumes";

interface IVolumeall {
  volume: number;
  date: string;
}

const convertVolume = (volumeData: any[]): IVolumeall[] => {
  return volumeData.map((volItem) => {
    return {
      volume: Number(volItem.volume),
      date: volItem.date,
    };
  });
};

const fetch = async (timestamp: number, _t: any, options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay);
  const historicalVolume: IVolumeall[] = convertVolume(
    await fetchURL(historicalVolumeEndpoint + `?chain=${options.chain}`)
  );
  const dateStr = new Date(dayTimestamp * 1000).toLocaleDateString("en-US", {
    timeZone: "UTC",
  });
  const [month, day, year] = dateStr.split("/");
  const formattedDate = `${year}/${String(month).padStart(2, "0")}/${String(
    day
  ).padStart(2, "0")}`;

  const dailyVolume = historicalVolume.find(
    (dayItem) => dayItem.date === formattedDate
  )?.volume;

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = convertVolume(
    await fetchURL(historicalVolumeEndpoint)
  );
  return new Date(historicalVolume[0].date).getTime() / 1000;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: getStartTimestamp,
    },
    [CHAIN.ECLIPSE]: {
      fetch,
      start: getStartTimestamp,
    },
  },
};

export default adapter;

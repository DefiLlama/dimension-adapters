import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IVolumeall {
  startDateTime: string;
  dailyVolumeUSD: string;
}

const baseUrl = "https://stats-api.panora.exchange";
const endpoint = "getDefiLlamaStats";

const getStartOfDay = (timestamp: number) => {
  const now = new Date(timestamp);

  const startOfDayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const startOfDayISO = startOfDayUTC.toISOString();

  return startOfDayISO;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getStartOfDay(timestamp);

  const historicalVolume: IVolumeall[] = (
    await fetchURL(`${baseUrl}/${endpoint}`)
  )?.dailyVolumeUSD;

  const totalVolume = historicalVolume
    .filter(
      (volItem) =>
        new Date(volItem.startDateTime)?.getTime() <=
        new Date(dayTimestamp)?.getTime()
    )
    .reduce((acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD), 0);

  const dailyVolume = historicalVolume.find(
    (dayItem) =>
      new Date(dayItem.startDateTime)?.getTime() ===
      new Date(dayTimestamp)?.getTime()
  )?.dailyVolumeUSD;

  return {
    totalVolume: String(totalVolume),
    dailyVolume,
    timestamp: new Date(dayTimestamp)?.getTime() / 1000,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: new Date("2023-11-28T00:00:00.000Z").getTime() / 1000,
    },
  },
};

export default adapter;

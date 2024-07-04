import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://megaton.fi/api/dashboard/info?"

interface IVolumeall {
  amount: string;
  dateId: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).dayVolume;
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.dateId).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { amount }) => acc + Number(amount), 0)

  const dateString = new Date(dayTimestamp * 1000).toISOString().split('T')[0];
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.dateId.split('T')[0] === dateString)?.amount

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: 1675814400,
    },
  },
};

export default adapter;

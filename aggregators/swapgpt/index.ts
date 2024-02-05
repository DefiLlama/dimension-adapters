import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";



interface IVolumeall {
  grouptimestamp: string;
  amount: string;
}

const baseUrl = "https://stats.swapgpt.ai"
const endpoint = "stats/getDefiLamaStats"


const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(`${baseUrl}/${endpoint}`))?.volumeInUsd
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.grouptimestamp).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { amount }) => acc + Number(amount), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.grouptimestamp).getTime() / 1000) === dayTimestamp)?.amount

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: (new Date('2023-11-28T00:00:00.000Z').getTime() / 1000),
    }
  },
};

export default adapter;

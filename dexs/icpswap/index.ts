import { Adapter, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";

const pairsURL = "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/pairs";
const volumeURL = (pool_id: string) => `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/totalVolumeUSD?poolId=${pool_id}&limit=1000`;

interface IPairs {
  pool_id: string;
}

interface IVolume {
  day: string;
  totalVolumeUSD: string;
  volumeUSDChange: string;
  volumeUSD: string;
}

const fetch  = async (timestamp: number): Promise<FetchResultVolume> => {
  const pairs: IPairs[] = (await fetchURL(pairsURL)).data;
  const pools = pairs.map((e: IPairs) => e.pool_id);
  const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
  const historicalVolume: IVolume[]  = (await Promise.all(pools.map((e: string) => fetchURL(volumeURL(e))))).map((e: any) => e.data).flat();
  const dailyVolume = historicalVolume.filter((e: IVolume) => Number(e.day) === dateId)
    .reduce((a: number, b: IVolume) => a + Number(b.volumeUSD), 0)
  const totalVolume = historicalVolume.filter((e: IVolume) => Number(e.day) <= dateId)
    .reduce((a: number, b: IVolume) => a + Number(b.totalVolumeUSD), 0)
  return {
    dailyVolume: `${dailyVolume}`,
    totalVolume: `${totalVolume}`,
    timestamp
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      start: async () => 1689465600,
    },
  }
}

export default adapter;

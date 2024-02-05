// https://sentrio-api.pontem.network/api/volumes
import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://sentrio-api.pontem.network/api/volumes";

interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data;
  const totalVolume = historicalVolume
    .filter(volItem => Number(volItem.timestamp) <= dayTimestamp)
    .reduce((acc, { value }) => acc + Number(value), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => Number(dayItem.timestamp) === dayTimestamp)?.value

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: 1668902400
    },
  },
};

export default adapter;

import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://aptos-mainnet-api.bluemove.net/api/histogram";

interface IVolumeall {
  num: string;
  date: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.list;
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.date.split('T')[0]).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { num }) => acc + Number(num), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === dayTimestamp)?.num
  const rateFees = 0.02;
  const dailyFees = Number(dailyVolume) * rateFees;
  const totalFees = Number(totalVolume) * rateFees;
  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    totalFees: `${totalFees}`,
    dailyFees:  dailyFees ? `${dailyFees}` : undefined,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: 1666224000,
    },
  },
};

export default adapter;

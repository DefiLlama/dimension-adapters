// https://api.heraswap.finance/report/volume-day?start_time=1677628800&end_time=1686246441

import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (end_time: number) => `https://api.heraswap.finance/report/volume-day?start_time=1677628800&end_time=${end_time}`

interface IVolumeall {
  value: string;
  record_date: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(dayTimestamp))).data;
  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.record_date).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { value }) => acc + Number(value), 0)

  const dateString = new Date(dayTimestamp * 1000).toISOString().split('T')[0];
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.record_date.split('T')[0] === dateString)?.value

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ONUS]: {
      fetch,
      start: 1677628800,
    },
  },
};
// onus
export default adapter;

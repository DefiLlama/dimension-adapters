import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getPrices } from "../../utils/prices";

const historicalVolumeEndpoint = "https://api.zilstream.com/volume"

interface IVolumeall {
  value: string;
  time: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data;
  const _dailyVolume =  historicalVolume.filter(volItem => (new Date(volItem.time.split('T')[0]).getTime() / 1000) === dayTimestamp);
  const dailyVolume = Math.abs(Number(_dailyVolume[0].value) - Number(_dailyVolume[_dailyVolume.length-1].value))
  const priceId = 'coingecko:zilliqa';
  const prices = await getPrices([priceId], dayTimestamp);
  const dailyVolumeUSD = dailyVolume ? `${Number(dailyVolume) * prices[priceId].price}` : undefined
  return {
    dailyVolume: dailyVolumeUSD ? `${dailyVolumeUSD}` : undefined,
    timestamp: dayTimestamp,
  };
};



const adapter: SimpleAdapter = {
  adapter: {
    zilliqa: {
      fetch,
      runAtCurrTime: true,
      start: async () => 1673049600,
    },
  },
};

export default adapter;

import axios from "axios";
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getPrices } from "../../utils/prices";

interface IVolumeall {
  time: string;
  volume: string;
  totalVolume: string;
};

const historicalVolumeEndpoint = "https://api-mainnet-prod.minswap.org/defillama/v2/volume-series";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const vols: IVolumeall[] = (await axios.get(historicalVolumeEndpoint))?.data;

  const dailyVolume = vols
    .find(dayItem => new Date(Number(dayItem.time)).getTime() / 1000 === dayTimestamp)?.volume

  const totalVolume = vols
    .find(dayItem => new Date(Number(dayItem.time)).getTime() / 1000 === dayTimestamp)?.totalVolume


  const coinId = "coingecko:cardano";
  const prices = await getPrices([coinId], dayTimestamp)

  return {
    timestamp: dayTimestamp,
    totalVolume: totalVolume ? String(Number(totalVolume)/1e6 * prices[coinId].price) : "0",
    dailyVolume: dailyVolume ? String(Number(dailyVolume)/1e6 * prices[coinId].price) : "0"
  }
}

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await axios.get(historicalVolumeEndpoint))?.data;
  return (new Date(Number(historicalVolume[0].time)).getTime()) / 1000;
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CARDANO]: {
      start: getStartTimestamp,
      fetch: fetch,
    }
  }
};

export default adapter;

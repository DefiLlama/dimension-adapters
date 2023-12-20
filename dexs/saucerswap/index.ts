import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";
import { getPrices } from "../../utils/prices";

const historicalVolumeEndpoint = (to: number) =>`https://server.saucerswap.finance/api/public/stats/platformData?field=VOLUME&interval=DAY&from=1650586&to=${to}`
// https://server.saucerswap.finance/api/public/stats/platformData?field=VOLUME&interval=DAY&from=1650586&to=1682093355
interface IVolumeall {
  timestampSeconds: string;
  valueHbar: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await axios.get(historicalVolumeEndpoint(new Date().getTime() / 1000), { headers: {
    'origin': 'https://analytics.saucerswap.finance',
  }}))?.data;

  const totalVolume = historicalVolume
    .filter(volItem => Number(volItem.timestampSeconds) <= dayTimestamp)
    .reduce((acc, { valueHbar }) => acc + Number(valueHbar), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => Number(dayItem.timestampSeconds) === dayTimestamp)?.valueHbar

  const coinId = "coingecko:hedera-hashgraph";
  const prices = await getPrices([coinId], dayTimestamp)

  return {
    // totalVolume: totalVolume ? String(totalVolume/1e8 * prices[coinId].price) : "0",
    dailyVolume: dailyVolume ? String(Number(dailyVolume)/1e8 * prices[coinId].price) : "0",
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: async () => 1659571200,
    },
  },
};

export default adapter;

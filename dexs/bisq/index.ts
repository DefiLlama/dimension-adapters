import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getPrices } from "../../utils/prices";

const historicalVolumeEndpoint = "https://bisq.markets/bisq/api/markets/volumes?interval=day"

interface IVolumeall {
  volume: string;
  period_start: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data;
  const totalVolume = historicalVolume
    .filter(volItem => volItem.period_start <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.period_start === dayTimestamp)?.volume

  const coinId = "coingecko:bitcoin";
  const prices = await getPrices([coinId], dayTimestamp)

  return {
    totalVolume: totalVolume ? String(Number(totalVolume) * prices[coinId].price) : "0",
    dailyVolume: dailyVolume ? String(Number(dailyVolume) * prices[coinId].price) : "0",
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BITCOIN]: {
      fetch,
      start: 1525651200,
    },
  },
};

export default adapter;

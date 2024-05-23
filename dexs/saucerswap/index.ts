import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getPrices } from "../../utils/prices";
import { httpGet } from "../../utils/fetchURL";

const historicalVolumeEndpoint = (to: number) =>`https://server.saucerswap.finance/api/public/stats/platformData?field=VOLUME&interval=DAY&from=1650586&to=${to}`
// https://server.saucerswap.finance/api/public/stats/platformData?field=VOLUME&interval=DAY&from=1650586&to=1682093355
interface IVolumeall {
  timestampSeconds: string;
  valueHbar: string;
}

const fetch = async (timestamp: number , _: ChainBlocks, { createBalances, startOfDay }: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint(new Date().getTime() / 1000), { headers: {
    'origin': 'https://analytics.saucerswap.finance',
  }}));

  const totalVolume = historicalVolume
    .filter(volItem => Number(volItem.timestampSeconds) <= startOfDay)
    .reduce((acc, { valueHbar }) => acc + Number(valueHbar), 0)

  const _dailyVolume = historicalVolume
    .find(dayItem => Number(dayItem.timestampSeconds) === startOfDay)?.valueHbar


  const dailyVolume = createBalances()
  dailyVolume.addCGToken("hedera-hashgraph", (_dailyVolume as any)/1e8)

  return {
    // totalVolume: totalVolume ? String(totalVolume/1e8 * prices[coinId].price) : "0",
    dailyVolume,
    timestamp: startOfDay,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: 1659571200,
    },
  },
};

export default adapter;

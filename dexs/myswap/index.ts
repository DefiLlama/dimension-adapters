import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (pool_number: number) => `https://ddektitdlncgg.cloudfront.net/myswapapi/pool/${pool_number}/volume`;

interface IVolumeall {
  volume: string;
  time: number;
}

const NUMBER_OF_POOL = 8;

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const poolCall = Array.from(Array(NUMBER_OF_POOL).keys()).map((e: number) => fetchURL(historicalVolumeEndpoint(e + 1)));
  const historicalVolume: IVolumeall[] = (await Promise.all(poolCall))
    .map((e:any) => e.data).flat()
    .map((p: any) => Object.keys(p.volume_usd).map((x: any) => {
      return {
        volume: p.volume_usd[x].usd,
        time: Math.floor(p.timestamp)
      }
    })).flat();

  const dailyVolume = historicalVolume
    .filter(volItem => volItem.time === dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0);

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch,
      start: '2022-11-18'
    },
  },
};

export default adapter;

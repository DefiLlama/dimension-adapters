import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = (pool_number: number) => `https://ddektitdlncgg.cloudfront.net/myswapapi/pool/${pool_number}/volume`;

interface IVolumeall {
  volume: string;
  time: number;
}

const NUMBER_OF_POOL = 8;

const fetch = async (options: FetchOptions) => {
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
    .filter(volItem => volItem.time === options.startOfDay)
    .reduce((acc, { volume }) => acc + Number(volume), 0);

  return {
    dailyVolume: dailyVolume,
  };
};



const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STARKNET],
  start: '2022-11-18',
  deadFrom: '2025-05-15',
};

export default adapter;

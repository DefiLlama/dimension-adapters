import { FetchOptions, SimpleAdapter } from '../adapters/types';
import fetchURL from '../utils/fetchURL';
import { CHAIN } from './chains';


export const fetchPolymarketBuilderVolume = async ({ options, builder }: { options: FetchOptions, builder: string }) => {

  const data = await fetchURL('https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY')
  const dateString = (new Date(options.startOfDay * 1000).toISOString()).replace('.000Z', 'Z' )
  const volume = data.find((item: any) => item.dt === dateString && item.builder === builder)

  if (!volume) {
    throw new Error(`No volume data found for ${builder} on ${dateString}`);
  }

  return { dailyVolume: volume.volume };
};


export function polymarketBuilderExports({ builder, start }: { builder: string, start: string }) {

  const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    return await fetchPolymarketBuilderVolume({ options, builder });
  }

  const adapter: SimpleAdapter = {
    version: 1,
    chains: [CHAIN.POLYGON],
    fetch,
    doublecounted: true,
    start,
  }

  return adapter as SimpleAdapter
}


export default polymarketBuilderExports;
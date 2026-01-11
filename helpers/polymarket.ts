import { FetchOptions, SimpleAdapter } from '../adapters/types';
import fetchURL from '../utils/fetchURL';
import { CHAIN } from './chains';
import * as sdk from "@defillama/sdk";


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

interface GetPolymarketVolumeProps {
  options: FetchOptions;
  exchanges: Array<string>;
  currency: string;
}

export async function getPolymarketVolume(props: GetPolymarketVolumeProps): Promise<{ dailyVolume: sdk.Balances }> {
  const { options, exchanges, currency } = props;
  
  const dailyVolume = options.createBalances();
  
  const OrderFilledLogs = await options.getLogs({
    targets: exchanges,
    eventAbi: 'event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)',
    flatten: true,
  });

  for (const log of OrderFilledLogs) {
    if (log.makerAssetId.toString() === '0') {
      const volumeInWei = BigInt(log.makerAmountFilled) / 2n;
      dailyVolume.add(currency, volumeInWei);
    }
    else if (log.takerAssetId.toString() === '0') {
      const volumeInWei = BigInt(log.takerAmountFilled) / 2n;
      dailyVolume.add(currency, volumeInWei);
    }
  }

  return { dailyVolume };
}


export default polymarketBuilderExports;
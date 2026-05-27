import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';
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

export async function fetchPolymarketV2BuilderFees({ options, builderCode }: { options: FetchOptions, builderCode: string }) {
  const dailyFees = options.createBalances();

  let cursor: string | undefined;
  do {
    const url = `https://clob.polymarket.com/builder/trades?builder_code=${builderCode}&after=${options.startTimestamp}&before=${options.endTimestamp}${cursor ? `&next_cursor=${cursor}` : ''}`;
    const tradesData = await fetchURL(url);
    for (const trade of tradesData.data) {
      dailyFees.addUSDValue(Number(trade.builderFee || 0), 'Polymarket Builder Fees');
    }
    cursor = tradesData.next_cursor;
    await sleep(500);
  } while (cursor && cursor !== 'LTE=');

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

export function polymarketV2BuilderFeesExports({ builderCode, builderName, start }: { builderCode: string, builderName: string, start: string }) {
  const fetch = async (options: FetchOptions) => {
    return await fetchPolymarketV2BuilderFees({ options, builderCode });
  }

  const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.POLYGON],
    fetch,
    start,
    doublecounted: true,
    methodology: {
      Fees: `Builder fees received by ${builderName} from trades on Polymarket v2`,
      Revenue: `Builder fees received by ${builderName} from trades on Polymarket v2`,
      ProtocolRevenue: `Builder fees received by ${builderName} from trades on Polymarket v2`,
    },
    breakdownMethodology: {
      Fees: {
        'Polymarket Builder Fees': `Builder fees received by ${builderName} from trades on Polymarket v2`,
      },
      Revenue: {
        'Polymarket Builder Fees': `Builder fees received by ${builderName} from trades on Polymarket v2`,
      },
      ProtocolRevenue: {
        'Polymarket Builder Fees': `Builder fees received by ${builderName} from trades on Polymarket v2`,
      },
    }
  }

  return adapter;
}

interface GetPolymarketVolumeProps {
  options: FetchOptions;
  exchanges: Array<string>;
  currency: string;
}

export async function getPolymarketVolume(props: GetPolymarketVolumeProps): Promise<FetchResult> {
  const { options, exchanges, currency } = props;
  
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  
  const OrderFilledLogs = await options.getLogs({
    targets: exchanges,
    eventAbi: 'event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)',
    flatten: true,
  });

  for (const log of OrderFilledLogs) {
    if (log.makerAssetId.toString() === '0') {
      dailyVolume.add(currency, BigInt(log.makerAmountFilled) / 2n);
      dailyNotionalVolume.add(currency, BigInt(log.takerAmountFilled) / 2n);
    }
    else if (log.takerAssetId.toString() === '0') {
      dailyVolume.add(currency, BigInt(log.takerAmountFilled) / 2n);
      dailyNotionalVolume.add(currency, BigInt(log.makerAmountFilled) / 2n)
    }
  }

  return { dailyVolume, dailyNotionalVolume };
}


export default polymarketBuilderExports;
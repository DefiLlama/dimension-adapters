import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';
import { CHAIN } from './chains';

// Data API v1 is retired on 2026-10-24: https://docs.polymarket.com/migrate/data-api-v1-to-v2
// v2 wraps the rows in `data`, uses snake_case fields and a YYYY-MM-DD `date`. It is not paginated
// and serves only the latest 90 daily buckets (`limit` max 90), so older days cannot be fetched.
const BUILDERS_VOLUME_URL = 'https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90'

// One row of the v2 builders volume series (data-api.polymarket.com/v2/docs).
type BuilderVolumeRow = {
  date: string
  builder_name: string
  volume: number
}

export const fetchPolymarketBuilderVolume = async ({ options, builder, builderCode }: { options: FetchOptions, builder: string, builderCode?: string }) => {

  const { data }: { data: BuilderVolumeRow[] } = await fetchURL(BUILDERS_VOLUME_URL)
  const dateString = new Date(options.startOfDay * 1000).toISOString().slice(0, 10)
  const oldestDate: string | undefined = data.reduce((oldest: string | undefined, item) => !oldest || item.date < oldest ? item.date : oldest, undefined)
  if (oldestDate && dateString < oldestDate) {
    throw new Error(`Polymarket builder volume is only served from ${oldestDate}, cannot fetch ${builder} on ${dateString}`);
  }
  const volume = data.find((item) => item.date === dateString && item.builder_name === builder)

  if (!volume) {
    throw new Error(`No volume data found for ${builder} on ${dateString}`);
  }

  const result: FetchResult = { dailyNotionalVolume: volume.volume };

  // USD (cash) volume: sum sizeUsdc across the builder's attributed trades,
  // paging the same CLOB endpoint used by fetchPolymarketV2BuilderFees below.
  if (builderCode) {
    const dailyVolume = options.createBalances();
    let cursor: string | undefined;
    do {
      const url = `https://clob.polymarket.com/builder/trades?builder_code=${builderCode}&after=${options.startTimestamp}&before=${options.endTimestamp}${cursor ? `&next_cursor=${cursor}` : ''}`;
      const tradesData = await fetchURL(url);
      for (const trade of tradesData.data) {
        dailyVolume.addUSDValue(Number(trade.sizeUsdc || 0));
      }
      cursor = tradesData.next_cursor;
      await sleep(500);
    } while (cursor && cursor !== 'LTE=');
    result.dailyVolume = dailyVolume;
  }

  return result;
};


export function polymarketBuilderExports({ builder, start, builderCode }: { builder: string, start: string, builderCode?: string }) {

  const fetch = async (options: FetchOptions) => {
    return await fetchPolymarketBuilderVolume({ options, builder, builderCode });
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
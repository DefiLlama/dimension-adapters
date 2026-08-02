import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { APTOS_RPC, getResources } from '../../helpers/aptos';
import { httpGet } from "../../utils/fetchURL";
import asyncRetry from "async-retry";
const plimit = require('p-limit');

// httpGet with backoff so a transient failure doesn't silently truncate a
// pool's event walk (getSwapEvent breaks on any thrown error).
const httpGetRetry = (url: string) => asyncRetry(() => httpGet(url), { retries: 3, minTimeout: 500, maxTimeout: 4000, factor: 2 })
// APTOS_RPC is a configured (non-public) endpoint, so we can walk pools in
// parallel instead of one-at-a-time.
const CONCURRENCY = 5;
const limits = plimit(CONCURRENCY);

interface ISwapEventData {
  type: string;
  amount_x_in: string;
  amount_x_out: string;
  amount_y_in: string;
  amount_y_out: string;
  user: string;
}
const getToken = (i: string) => i.split('<')[1].replace('>', '').split(', ');
const account = '0x31a6675cbe84365bf2b0cbce617ece6c47023ef70826533bde5203d32171dc3c';

const fetchVolume: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const fromTimestamp = options.fromTimestamp
  const toTimestamp = options.toTimestamp;
  const resources = await getResources(account);
  const pools = resources.filter(e => e.type?.includes('swap::PairEventHolder'))
  .map((e: any) => {
    const [token0, token1] = getToken(e.type);
    return {
      type: e.type,
      token0,
      token1,
      swap_events: {
        counter: e.data.swap.counter,
        creation_num: e.data.swap.guid.id.creation_num,
      },
      counter: Number(e.data.swap.counter),
    }
  })
  // skip pools that have never had a swap event (nothing to page through)
  .filter(pool => pool.counter > 0)
  .sort((a, b) => b.counter - a.counter)
  const logs_swap: ISwapEventData[] = (await Promise.all(pools.map(async pool => limits(() => getSwapEvent(pool, fromTimestamp, toTimestamp))))).flat()
  const dailyVolume = options.createBalances();
  logs_swap.map((e: ISwapEventData) => {
    const [token0, token1] = getToken(e.type);
    dailyVolume.add(token0, e.amount_x_out)
    dailyVolume.add(token1, e.amount_y_out)
  })
  return { dailyVolume: dailyVolume }
}

const getSwapEvent = async (pool: any, fromTimestamp: number, toTimestamp: number): Promise<ISwapEventData[]> => {
  const limit = 100;
  const swap_events: ISwapEventData[] = [];
  let start = Math.max(pool.swap_events.counter - limit, 0);
  while (true) {
    if (start < 0) break;
    const getEventByCreation = `${APTOS_RPC}/v1/accounts/${account}/events/${pool.swap_events.creation_num}?start=${start}&limit=${limit}`;
    try {
      const event: any[] = await httpGetRetry(getEventByCreation);
      const listSequence: number[] = event.map(e => Number(e.sequence_number));
      const lastMin = Math.min(...listSequence);
      if (!isFinite(lastMin)) break;
      const lastVision = event.find(e => Number(e.sequence_number) === lastMin)?.version;
      const urlBlock = `${APTOS_RPC}/v1/blocks/by_version/${lastVision}`;
      const block = await httpGetRetry(urlBlock);
      const lastTimestamp = toUnixTime(block.block_timestamp);
      const lastTimestampNumber = lastTimestamp;
      if (lastTimestampNumber >= fromTimestamp && lastTimestampNumber <= toTimestamp) {
        swap_events.push(...event);
      }
      if (lastTimestampNumber < fromTimestamp) {
        break;
      }
      if (start === 0) break;
      start = Math.max(lastMin - (limit + 1), 0);
    } catch (e: any) {
      break;
    }
  }
  return swap_events.map((e: any) => ({
    ...e,
    type: e.type,
    ...e.data,
  }));
}

const toUnixTime = (timestamp: string) => Number((Number(timestamp) / 1e6).toString().split('.')[0])

const adapter: SimpleAdapter = {
  pullHourly: true,
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchVolume,
      start: '2024-02-27',
    }
  },
  version: 2,
}

export default adapter;

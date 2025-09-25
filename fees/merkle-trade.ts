import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getResources, APTOS_PRC } from '../helpers/aptos';
import { httpGet } from "../utils/fetchURL";

// Constants
const ACCOUNT = '0x5ae6789dd2fec1a9ec9cccfb3acaf12e93d432f0a3a42c92fe1a9d490b7bbc06';
const LIMIT = 100;
const USDC_DECIMALS = 1e6;

// Types
interface EventResource {
  type: string;
  data: {
    deposit_fee_event: {
      counter: number;
      guid: {
        id: {
          creation_num: string;
        }
      }
    }
  }
}

interface Pool {
  type: string;
  swap_events: {
    counter: number;
    creation_num: string;
  };
  counter: number;
}

interface ILogs {
  dev_amount: string;
  lp_amount: string;
  stake_amount: string;
  type?: string;
  data?: any;
}

// Utility functions
const toUnixTime = (timestamp: string): number => 
  Number((Number(timestamp) / 1e6).toString().split('.')[0]);

const calculateFees = (log: ILogs) => {
  const dev = Number(log.dev_amount);
  const stake = Number(log.stake_amount);
  return {
    revenue: (dev + stake) / USDC_DECIMALS
  };
};

// Core functions
const getEventLogs = async (pool: Pool, fromTimestamp: number, toTimestamp: number): Promise<ILogs[]> => {
  const swap_events: ILogs[] = [];
  let start = Math.max(pool.swap_events.counter - LIMIT, 0);

  while (start >= 0) {
    try {
      const getEventByCreation = `${APTOS_PRC}/v1/accounts/${ACCOUNT}/events/${pool.swap_events.creation_num}?start=${start}&limit=${LIMIT}`;
      const events: any[] = await httpGet(getEventByCreation);
      
      if (!events.length) break;

      const listSequence = events.map(e => Number(e.sequence_number));
      const lastMin = Math.min(...listSequence);
      
      if (!isFinite(lastMin)) break;

      const lastEvent = events.find(e => Number(e.sequence_number) === lastMin);
      if (!lastEvent?.version) break;

      const urlBlock = `${APTOS_PRC}/v1/blocks/by_version/${lastEvent.version}`;
      const block = await httpGet(urlBlock);
      const lastTimestamp = toUnixTime(block.block_timestamp);

      if (lastTimestamp >= fromTimestamp && lastTimestamp <= toTimestamp) {
        swap_events.push(...events);
      }
      
      if (lastTimestamp < fromTimestamp || start === 0) break;
      
      start = Math.max(lastMin - (LIMIT + 1), 0);
    } catch (error) {
      console.error('Error fetching event logs:', error);
      break;
    }
  }

  return swap_events.map((event: any) => ({
    ...event,
    type: event.type,
    ...event.data,
  }));
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const resources = await getResources(ACCOUNT);
  const filterEvents = resources.filter((e: EventResource) => 
    e.type?.includes('fee_distributor::FeeDistributorEvents')
  );

  const pools: Pool[] = filterEvents
    .map((event: EventResource) => ({
      type: event.type,
      swap_events: {
        counter: event.data.deposit_fee_event.counter,
        creation_num: event.data.deposit_fee_event.guid.id.creation_num,
      },
      counter: Number(event.data.deposit_fee_event.counter),
    }))
    .sort((a, b) => b.counter - a.counter);

  const logs = await Promise.all(
    pools.map(pool => getEventLogs(pool, options.fromTimestamp, options.toTimestamp))
  );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  logs.flat().forEach((log: ILogs) => {
    const { revenue } = calculateFees(log);
    dailyFees.addCGToken('usd-coin', revenue);
    dailyRevenue.addCGToken('usd-coin', revenue);
  });

  return { dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2024-02-27',
    }
  }
};

export default adapter;
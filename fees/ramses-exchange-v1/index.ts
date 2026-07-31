import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";
import { fees_bribes } from './bribes';
import { METRIC } from "../../helpers/metrics";


const FACTORY_ADDRESS = '0xaaa20d08e59f6561f242b08513d36266c5a29415';
const FIRST_SWAP_ONLY_DAY_TIMESTAMP = 1776816000; // 2026-04-22T00:00:00Z

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1678838400,
}

const getBribes = async ({ fromTimestamp, toTimestamp, createBalances, getFromBlock, }: FetchOptions): Promise<any> => {
  const fromBlock = await getFromBlock()
  const bribes = createBalances();
  const bribes_delta = createBalances();
  await fees_bribes(fromBlock, toTimestamp, bribes_delta);
  await fees_bribes(fromBlock, fromTimestamp, bribes);
  bribes.subtract(bribes_delta);
  return {
    timestamp: toTimestamp,
    dailyBribesRevenue: bribes,
  };
};

const methodology = {
  Volume: "Daily swap volume is calculated from on-chain swaps in both historical and current periods.",
  UserFees: "Through April 21, 2026, user fees include swap fees and bribes; from April 22, 2026, they include swap fees only.",
  ProtocolRevenue: "5% of swap fees go to the protocol in both historical and current periods.",
  HoldersRevenue: "75% of swap fees and all bribes go to holders through April 21, 2026; from April 22, 2026, holders receive 75% of swap fees.",
  SupplySideRevenue: "20% of swap fees go to LPs.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users in both historical and current periods",
    ['Bribes']: "Bribes paid by protocols through April 21, 2026",
  },
  Revenue: {
    ['Swap Fees to protocol']: "5% of swap fees go to the protocol treasury",
    ['Swap Fees to holders']: "75% of swap fees go to the holders",
    ['Bribes to holders']: "All bribes go to holders through April 21, 2026",
  },
  ProtocolRevenue: {
    ['Swap Fees to protocol']: "5% of swap fees go to the protocol treasury",
  },
  SupplySideRevenue: {
    ['Swap Fees to LPs']: "20% of swap fees go to the LPs",
  },
  HoldersRevenue: {
    ['Swap Fees to holders']: "75% of swap fees go to the holders",
    ['Bribes to holders']: "All bribes go to holders through April 21, 2026",
  },
}


const feeAdapter = uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: FACTORY_ADDRESS, },
}).adapter![CHAIN.ARBITRUM].fetch

const fetch = async (options: FetchOptions) => {
  const isHistorical = options.endTimestamp <= FIRST_SWAP_ONLY_DAY_TIMESTAMP;
  if (!isHistorical && options.fromTimestamp + 1 < FIRST_SWAP_ONLY_DAY_TIMESTAMP)
    throw new Error('RAMSES v1 fetch window cannot cross the April 22, 2026 historical/current cutoff.');

  const v1Results: any = await feeAdapter!(options as any, {}, options)
  const bribesResult = isHistorical ? await getBribes(options) : undefined;
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const swapFees = Number(await v1Results.dailyFees.getUSDValue());
  const bribeRevenue = bribesResult ? Number(await bribesResult.dailyBribesRevenue.getUSDValue()) : 0;

  dailyFees.addUSDValue(swapFees, METRIC.SWAP_FEES);
  if (isHistorical)
    dailyFees.addUSDValue(bribeRevenue, 'Bribes');

  dailyHoldersRevenue.addUSDValue(swapFees * 0.75, 'Swap Fees to holders');
  dailyProtocolRevenue.addUSDValue(swapFees * 0.05, 'Swap Fees to protocol');
  dailySupplySideRevenue.addUSDValue(swapFees * 0.20, 'Swap Fees to LPs');
  if (isHistorical)
    dailyHoldersRevenue.addUSDValue(bribeRevenue, 'Bribes to holders');

  const dailyRevenue = dailyHoldersRevenue.clone();
  dailyRevenue.add(dailyProtocolRevenue);

  return {
    dailyVolume: v1Results.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  // UniV2 log block ranges are inclusive; adjacent hourly slices can overlap.
  pullHourly: false,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: startTimeV2[CHAIN.ARBITRUM],
    },
  },
};

export default adapter;

import * as sdk from "@defillama/sdk";
import { cache } from "@defillama/sdk";
import { ethers } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fees_bribes } from './bribes';
import { addOneToken } from "../../helpers/prices";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../../helpers/getUniSubgraph"
import { METRIC } from "../../helpers/metrics";

const FACTORY_ADDRESS = '0xaa2cd7477c451e703f3b9ba5663334914763edf8';
const OLD_FACTORY_DEPLOYMENT_BLOCK = 90593047;
const HISTORICAL_GRAPH_ENDPOINT = sdk.graph.modifyEndpoint('ATQTt3wRTgXy4canCh6t1yeczAz4ZuEkFQL2mrLXEMyQ');
const FIRST_VOLUME_ONLY_DAY_TIMESTAMP = 1783987200; // 2026-07-14T00:00:00Z
const POOL_CREATED_EVENT = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const SWAP_EVENT = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1685574000,
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

const historicalFetcher = getGraphDimensions2({
  graphUrls: {
    [CHAIN.ARBITRUM]: HISTORICAL_GRAPH_ENDPOINT,
  },
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    HoldersRevenue: 72,
    ProtocolRevenue: 8,
    SupplySideRevenue: 20,
    UserFees: 100,
    Revenue: 80,
  }
});

const methodology = {
  Volume: "Through July 13, 2026, volume comes from the historical Graph source; from July 14, 2026, volume is calculated from on-chain swaps for every factory pool.",
  UserFees: "Through July 13, 2026, user fees include swap fees and bribes; from July 14, 2026, this adapter reports volume only.",
  ProtocolRevenue: "Through July 13, 2026, 8% of swap fees go to the protocol; no fee or revenue dimensions are emitted from July 14, 2026.",
  HoldersRevenue: "Through July 13, 2026, 72% of swap fees and all bribes go to holders; no fee or revenue dimensions are emitted from July 14, 2026.",
  SupplySideRevenue: "Through July 13, 2026, 20% of swap fees go to LPs; no fee or revenue dimensions are emitted from July 14, 2026.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users through July 13, 2026",
    ['Bribes']: "Bribes paid by protocols through July 13, 2026",
  },
  Revenue: {
    ['Swap Fees to protocol']: "8% of swap fees go to the protocol treasury through July 13, 2026",
    ['Swap Fees to holders']: "72% of swap fees go to holders through July 13, 2026",
    ['Bribes to holders']: "All bribes go to holders through July 13, 2026",
  },
  ProtocolRevenue: {
    ['Swap Fees to protocol']: "8% of swap fees go to the protocol treasury through July 13, 2026",
  },
  SupplySideRevenue: {
    ['Swap Fees to LPs']: "20% of swap fees go to LPs through July 13, 2026",
  },
  HoldersRevenue: {
    ['Swap Fees to holders']: "72% of swap fees go to holders through July 13, 2026",
    ['Bribes to holders']: "All bribes go to holders through July 13, 2026",
  },
}

const fetchHistoricalMetrics = async (options: FetchOptions) => {
  const v2Result = await historicalFetcher(options)
  const bribesResult = await getBribes(options);

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const bribeRevenue = Number(await bribesResult.dailyBribesRevenue.getUSDValue());

  dailyFees.addUSDValue(v2Result.dailyFees, METRIC.SWAP_FEES);
  dailyFees.addUSDValue(bribeRevenue, 'Bribes');

  dailyHoldersRevenue.addUSDValue(Number(v2Result.dailyHoldersRevenue), 'Swap Fees to holders');
  dailyProtocolRevenue.addUSDValue(Number(v2Result.dailyProtocolRevenue), 'Swap Fees to protocol');
  dailySupplySideRevenue.addUSDValue(Number(v2Result.dailySupplySideRevenue), 'Swap Fees to LPs');
  dailyHoldersRevenue.addUSDValue(bribeRevenue, 'Bribes to holders');

  const dailyRevenue = dailyHoldersRevenue.clone();
  dailyRevenue.add(dailyProtocolRevenue);

  return {
    dailyVolume: v2Result.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const fetchCurrentMetrics = async (options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock) || fromBlock < 0 || toBlock < fromBlock)
    throw new Error(`Invalid RAMSES V2 block range: ${fromBlock}-${toBlock}.`);

  const dailyVolume = options.createBalances();
  if (fromBlock === toBlock)
    return { dailyVolume };

  const cacheKey = `tvl-adapter-cache/cache/logs/${options.chain}/${FACTORY_ADDRESS}.json`;
  const cacheResult = await cache.readCache(cacheKey, { readFromR2Cache: true });
  if (!cacheResult || !Array.isArray(cacheResult.logs) || !Number.isSafeInteger(cacheResult.fromBlock) || cacheResult.fromBlock < 0 ||
    !Number.isSafeInteger(cacheResult.toBlock) || cacheResult.toBlock < cacheResult.fromBlock || cacheResult.fromBlock > OLD_FACTORY_DEPLOYMENT_BLOCK)
    throw new Error('Invalid RAMSES V2 factory cache response.');

  const cacheFromBlock = cacheResult.fromBlock;
  const cacheToBlock = cacheResult.toBlock;
  const factoryLogs = [...cacheResult.logs];
  const validateBlockNumber = (log: any, minBlock: number, maxBlock: number) => {
    const blockNumber = Number(log?.blockNumber);
    if (!Number.isSafeInteger(blockNumber) || blockNumber < minBlock || blockNumber > maxBlock)
      throw new Error('Invalid RAMSES V2 PoolCreated log block number.');
  };

  cacheResult.logs.forEach((log: any) => {
    validateBlockNumber(log, cacheFromBlock, cacheToBlock);
    if (typeof log?.address !== 'string' || log.address.toLowerCase() !== FACTORY_ADDRESS)
      throw new Error('Invalid RAMSES V2 PoolCreated log emitter.');
  });
  if (cacheToBlock < toBlock) {
    const missingFromBlock = Math.max(cacheToBlock + 1, OLD_FACTORY_DEPLOYMENT_BLOCK);
    const missingLogs = await options.getLogs({
      target: FACTORY_ADDRESS,
      eventAbi: POOL_CREATED_EVENT,
      entireLog: true,
      fromBlock: missingFromBlock,
      toBlock,
    });
    if (!Array.isArray(missingLogs))
      throw new Error('Invalid RAMSES V2 factory log response.');
    missingLogs.forEach((log: any) => validateBlockNumber(log, missingFromBlock, toBlock));
    factoryLogs.push(...missingLogs);
  }

  const iface = new ethers.Interface([POOL_CREATED_EVENT]);
  const pools = new Map<string, [string, string]>();

  factoryLogs
    .filter((log: any) => Number(log.blockNumber) <= toBlock)
    .forEach((log: any) => {
      let parsedLog;
      try {
        parsedLog = iface.parseLog(log);
      } catch {
        throw new Error('Invalid RAMSES V2 PoolCreated log.');
      }
      if (!parsedLog)
        throw new Error('Invalid RAMSES V2 PoolCreated log.');

      const addresses = [parsedLog.args.pool, parsedLog.args.token0, parsedLog.args.token1];
      if (addresses.some((address: any) => !ethers.isAddress(address) || address === ethers.ZeroAddress))
        throw new Error('Invalid address in RAMSES V2 PoolCreated log.');

      const [pool, token0, token1] = addresses.map((address: string) => address.toLowerCase());
      const existingTokens = pools.get(pool);
      if (existingTokens && (existingTokens[0] !== token0 || existingTokens[1] !== token1))
        throw new Error(`Conflicting RAMSES V2 token metadata for pool ${pool}.`);
      pools.set(pool, [token0, token1]);
    });

  if (!pools.size)
    throw new Error('No RAMSES V2 pools found in factory logs.');

  const poolAddresses = [...pools.keys()];
  const swapLogs = await options.getLogs({
    targets: poolAddresses,
    eventAbi: SWAP_EVENT,
    flatten: false,
    fromBlock: fromBlock + 1,
    toBlock,
  });
  if (!Array.isArray(swapLogs) || swapLogs.length !== poolAddresses.length || swapLogs.some((poolLogs: any) => !Array.isArray(poolLogs)))
    throw new Error('Invalid RAMSES V2 swap log response.');

  swapLogs.forEach((poolLogs: any[], index: number) => {
    const [token0, token1] = pools.get(poolAddresses[index])!;
    poolLogs.forEach((log: any) => {
      addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });
    });
  });

  return { dailyVolume };
};

const fetch = async (options: FetchOptions) => {
  const isHistorical = options.endTimestamp <= FIRST_VOLUME_ONLY_DAY_TIMESTAMP;
  if (!isHistorical && options.fromTimestamp + 1 < FIRST_VOLUME_ONLY_DAY_TIMESTAMP)
    throw new Error('RAMSES V2 fetch window cannot cross the July 14, 2026 historical/current cutoff.');
  return isHistorical ? fetchHistoricalMetrics(options) : fetchCurrentMetrics(options);
};

const adapter: Adapter = {
  version: 2,
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

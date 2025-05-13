import { Balances, ChainApi, util } from '@defillama/sdk';

const { blocks: { getChainBlocks } } = util

export type ChainBlocks = Awaited<ReturnType<typeof getChainBlocks>>

export type ChainEndpoints = {
  [chain: string]: string
}

export type FetchResultBase = {
  timestamp?: number;
  block?: number;
};

export type FetchResultV2 = {
  [key: string]: FetchResponseValue | undefined;
};

export type FetchResultGeneric = FetchResultBase & {
  [key: string]: FetchResponseValue | undefined;
}

export type FetchOptions = {
  createBalances: () => Balances;
  getBlock: (timestamp: number, chain: string, chainBlocks: ChainBlocks) => Promise<number>;
  getLogs: (params: FetchGetLogsOptions) => Promise<any[]>;
  toTimestamp: number;
  fromTimestamp: number;
  startOfDay: number;
  getFromBlock: () => Promise<number>;
  getToBlock: () => Promise<number>;
  chain: string,
  api: ChainApi,
  fromApi: ChainApi,
  toApi: ChainApi,
  startTimestamp: number,
  endTimestamp: number,
  getStartBlock: () => Promise<number>,
  getEndBlock: () => Promise<number>,
  dateString: string,
  preFetchedResults?: any,
}

export type FetchGetLogsOptions = {
  eventAbi?: string,
  topic?: string,
  target?: string,
  targets?: string[],
  onlyArgs?: boolean,
  fromBlock?: number,
  toBlock?: number,
  flatten?: boolean,
  cacheInCloud?: boolean,
  entireLog?: boolean,
  skipCacheRead?: boolean,
  skipIndexer?: boolean,
  topics?: string[],
  noTarget?: boolean,
  parseLog?: boolean,
}

export type Fetch = (
  timestamp: number,
  chainBlocks: ChainBlocks,
  options: FetchOptions,
) => Promise<FetchResult>;

export type FetchV2 = (
  options: FetchOptions,
) => Promise<FetchResultV2>;

export type IStartTimestamp = () => Promise<number>

export type BaseAdapter = {
  [chain: string]: {
    start?: IStartTimestamp | number | string; // date can be in "YYYY-MM-DD" format
    fetch: Fetch | FetchV2;
    runAtCurrTime?: boolean;
    customBackfill?: Fetch | FetchV2;
    meta?: {
      methodology?: string | IJSON<string>
      hallmarks?: [number, string][]
    }
  }
};

export const DISABLED_ADAPTER_KEY = 'DISABLED_ADAPTER'

export enum ProtocolType {
  CHAIN = 'chain',
  PROTOCOL = 'protocol',
  COLLECTION = 'collection',
}

export type AdapterBase = {
  timetravel?: boolean
  isExpensiveAdapter?: boolean,
  protocolType?: ProtocolType;
  version?: number;
  deadFrom?: string;
  allowNegativeValue?: boolean;
  prefetch?: FetchV2;
}

export type SimpleAdapter = AdapterBase & {
  adapter: BaseAdapter
}

export type BreakdownAdapter = AdapterBase & {
  breakdown: {
    [version: string]: BaseAdapter
  };
};

export type Adapter = SimpleAdapter | BreakdownAdapter;
export type FetchResponseValue = string | number | Balances;

/**
 * Include here new adaptors types
 */

// VOLUME
export type FetchResultVolume = FetchResultBase & {
  dailyVolume?: FetchResponseValue
  totalVolume?: FetchResponseValue
  dailyShortOpenInterest?: FetchResponseValue
  dailyLongOpenInterest?: FetchResponseValue
  dailyOpenInterest?: FetchResponseValue
  dailyBridgeVolume?: FetchResponseValue
  totalBridgeVolume?: FetchResponseValue
};

// FEES
export type FetchResultFees = FetchResultBase & {
  totalFees?: FetchResponseValue;
  dailyFees?: FetchResponseValue;
  dailyUserFees?: FetchResponseValue;
  totalRevenue?: FetchResponseValue;
  dailyRevenue?: FetchResponseValue;
  dailyProtocolRevenue?: FetchResponseValue;
  dailyHoldersRevenue?: FetchResponseValue;
  dailySupplySideRevenue?: FetchResponseValue;
  totalProtocolRevenue?: FetchResponseValue;
  totalSupplySideRevenue?: FetchResponseValue;
  totalUserFees?: FetchResponseValue;
  dailyBribesRevenue?: FetchResponseValue;
  dailyTokenTaxes?: FetchResponseValue;
  totalHoldersRevenue?: FetchResponseValue;
};

// INCENTIVES
export type FetchResultIncentives = FetchResultBase & {
  tokenIncentives?: FetchResponseValue
};

// AGGREGATORS
export type FetchResultAggregators = FetchResultBase & {
  dailyVolume?: FetchResponseValue
  totalVolume?: FetchResponseValue
};

// OPTIONS
export type FetchResultOptions = FetchResultBase & {
  totalPremiumVolume?: FetchResponseValue
  totalNotionalVolume?: FetchResponseValue
  dailyPremiumVolume?: FetchResponseValue
  dailyNotionalVolume?: FetchResponseValue
  dailyShortOpenInterest?: FetchResponseValue
  dailyLongOpenInterest?: FetchResponseValue
  dailyOpenInterest?: FetchResponseValue
};


export enum AdapterType {
  FEES = 'fees',
  DEXS = 'dexs',
  INCENTIVES = 'incentives',
  AGGREGATORS = 'aggregators',
  DERIVATIVES = 'derivatives',
  OPTIONS = 'options',
  PROTOCOLS = 'protocols',
  // ROYALTIES = 'royalties',
  AGGREGATOR_DERIVATIVES = 'aggregator-derivatives',
  BRIDGE_AGGREGATORS = 'bridge-aggregators',
}

export type FetchResult = FetchResultVolume & FetchResultFees & FetchResultAggregators & FetchResultOptions & FetchResultIncentives

export const whitelistedDimensionKeys = new Set([
  'startTimestamp', 'chain', 'timestamp', 'block',

  'dailyVolume', 'totalVolume', 'dailyShortOpenInterest', 'dailyLongOpenInterest', 'dailyOpenInterest', 'dailyBridgeVolume', 'totalBridgeVolume',
  'totalFees', 'dailyFees', 'dailyUserFees', 'totalRevenue', 'dailyRevenue', 'dailyProtocolRevenue', 'dailyHoldersRevenue', 'dailySupplySideRevenue', 'totalProtocolRevenue', 'totalSupplySideRevenue', 'totalUserFees', 'dailyBribesRevenue', 'dailyTokenTaxes', 'totalHoldersRevenue',
  'tokenIncentives',
  'totalPremiumVolume', 'totalNotionalVolume', 'dailyPremiumVolume', 'dailyNotionalVolume',
])
export const accumulativeKeySet = new Set([
  'totalVolume', 'totalBridgeVolume', 'tokenIncentives', 'totalPremiumVolume', 'totalNotionalVolume',
  'totalFees', 'totalRevenue', 'totalProtocolRevenue', 'totalSupplySideRevenue', 'totalUserFees', 'totalHoldersRevenue',
])

// End of specific adaptors type

export interface IJSON<T> {
  [key: string]: T
}
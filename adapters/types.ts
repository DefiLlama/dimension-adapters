import { util } from '@defillama/sdk';

const { blocks: { getChainBlocks } } = util

export type ChainBlocks = Awaited<ReturnType<typeof getChainBlocks>>

export type ChainEndpoints = {
  [chain: string]: string
}

export type FetchResultBase = {
  timestamp: number;
  block?: number;
};

export type FetchResultGeneric = FetchResultBase & {
  [key: string]: number | string | undefined | IJSON<string>
}

export type Fetch = (
  timestamp: number,
  chainBlocks: ChainBlocks
) => Promise<FetchResult>;

export type IStartTimestamp = () => Promise<number>

export type BaseAdapter = {
  [chain: string]: {
    start: IStartTimestamp
    fetch: Fetch;
    runAtCurrTime?: boolean;
    customBackfill?: Fetch;
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

export type SimpleAdapter = {
  adapter: BaseAdapter
  protocolType?: ProtocolType;
}

export type BreakdownAdapter = {
  breakdown: {
    [version: string]: BaseAdapter
  };
  protocolType?: ProtocolType;
};

export type Adapter = SimpleAdapter | BreakdownAdapter;

/**
 * Include here new adaptors types
 */

// VOLUME
export type FetchResultVolume = FetchResultBase & {
  dailyVolume?: string // | IJSON<string>;
  totalVolume?: string // | IJSON<string>;
};

// FEES
export type FetchResultFees = FetchResultBase & {
  totalFees?: string | IJSON<string>;
  dailyFees?: string | IJSON<string>;
  dailyUserFees?: string | IJSON<string>;
  totalRevenue?: string | IJSON<string>;
  dailyRevenue?: string | IJSON<string>;
  dailyProtocolRevenue?: string | IJSON<string>;
  dailyHoldersRevenue?: string | IJSON<string>;
  dailySupplySideRevenue?: string | IJSON<string>;
  totalProtocolRevenue?: string | IJSON<string>;
  totalSupplySideRevenue?: string | IJSON<string>;
  totalUserFees?: string | IJSON<string>;
};

// INCENTIVES
export type FetchResultIncentives = FetchResultBase & {
  tokens?: IJSON<string> // | string
};

// AGGREGATORS
export type FetchResultAggregators = FetchResultBase & {
  dailyVolume?: string // | IJSON<string>;
  totalVolume?: string // | IJSON<string>;
};

// OPTIONS
export type FetchResultOptions = FetchResultBase & {
  totalPremiumVolume?: string // | IJSON<string>
  totalNotionalVolume?: string // | IJSON<string>
  dailyPremiumVolume?: string // | IJSON<string>
  dailyNotionalVolume?: string // | IJSON<string>
};


export enum AdapterType {
  FEES = 'fees',
  DEXS = 'dexs',
  INCENTIVES = 'incentives',
  AGGREGATORS = 'aggregators',
  DERIVATIVES = 'derivatives',
  OPTIONS = 'options',
  PROTOCOLS = 'protocols'
}

export type FetchResult = FetchResultVolume & FetchResultFees & FetchResultAggregators & FetchResultOptions & FetchResultIncentives

// End of specific adaptors type

export interface IJSON<T> {
  [key: string]: T
}
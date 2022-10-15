import { getChainBlocks } from '@defillama/sdk/build/computeTVL/blocks';

export type ChainBlocks = Awaited<ReturnType<typeof getChainBlocks>>

export type ChainEndpoints = {
  [chain: string]: string
}

export type FetchResultBase = {
  timestamp: number;
  block?: number;
};

export type FetchResultGeneric = FetchResultBase & {
  [key: string]: number | string | undefined
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
      metodology?: string
      hallmarks?: [number, string][]
    }
  }
};

export const DISABLED_ADAPTER_KEY = 'DISABLED_ADAPTER'

export enum ProtocolType {
  CHAIN = 'chain',
  PROTOCOL = 'protocol'
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
  dailyVolume?: string;
  totalVolume?: string;
};

// FEES
export type FetchResultFees = FetchResultBase & {
  totalFees?: string;
  dailyFees?: string;
  totalRevenue?: string;
  dailyRevenue?: string;
};

// INCENTIVES
export type FetchResultIncentives = FetchResultBase & {
  // TBD
};

export enum AdapterType {
  FEES = 'fees',
  VOLUME = 'volumes'
}

export type FetchResult = FetchResultVolume & FetchResultFees

// End of specific adaptors type
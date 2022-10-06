import { getChainBlocks } from '@defillama/sdk/build/computeTVL/blocks';

export type ChainBlocks = Awaited<ReturnType<typeof getChainBlocks>>

export type ChainEndpoints = {
  [chain: string]: string
}

export type FetchResultBase = {
  timestamp: number;
  block?: number;
  [key: string]: string | number | undefined
};

export type FetchResultVolume = FetchResultBase & {
  dailyVolume?: string;
  totalVolume?: string;
};

export type FetchResultFees = FetchResultBase & {
  totalFees?: string;
  dailyFees?: string;
  totalRevenue?: string;
  dailyRevenue?: string;
};

export type FetchResult = FetchResultVolume & FetchResultFees

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

export type SimpleAdapter = {
  adapter: BaseAdapter
  adapterType?: string;
}

export type BreakdownAdapter = {
  breakdown: {
    [version: string]: BaseAdapter
  };
  adapterType?: string;
};

export type Adapter = SimpleAdapter | BreakdownAdapter;

export enum AdapterType {
  FEES = 'fees',
  VOLUME = 'volume'
}
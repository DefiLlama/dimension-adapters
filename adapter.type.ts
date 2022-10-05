import { getChainBlocks } from '@defillama/sdk/build/computeTVL/blocks';

export type ChainBlocks = Awaited<ReturnType<typeof getChainBlocks>>

export type ChainEndpoints = {
  [chain: string]: string
}

export type FetchResult = {
  timestamp: number;
  block?: number;
  dailyVolume?: string;
  totalVolume?: string;
  [key: string]: string | number
};

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

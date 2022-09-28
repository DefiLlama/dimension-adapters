import { ChainBlocks } from "@defillama/adapters/volumes/dexVolume.type"

export type FetchResult = {
  block?: number;
  dailyFees?: string;
  totalFees: string;
  dailyRevenue?: string;
  totalRevenue: string;
  timestamp: number;
};

export type Fetch = (
  timestamp: number,
  chainBlocks: ChainBlocks
) => Promise<FetchResult>;

export type BaseAdapter = {
  [x: string]: {
    start: number | (() => Promise<number>)
    fetch: Fetch;
    runAtCurrTime?: boolean;
    customBackfill?: Fetch;
  };
};

export type BreakdownAdapter = {
  [x: string]: BaseAdapter;
};

export type BaseFeeAdapter = {
  fees: BaseAdapter;
  adapterType?: string;
};

export type FeeBreakdownAdapter = {
  breakdown: BreakdownAdapter;
  adapterType?: string;
};

export type FeeAdapter = BaseFeeAdapter | FeeBreakdownAdapter;

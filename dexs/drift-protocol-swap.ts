import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";

type DimentionResult = {
  dailyVolume?: number;
  dailyFees?: number;
  dailyUserFees?: number;
  dailyRevenue?: number;
  openInterestAtEnd?: number;
};

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {
  const sql = getSqlFromFile('helpers/queries/drift-protocol.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp
  });
  return queryDuneSql(options, sql);
};

async function getSpotDimensions(options: FetchOptions): Promise<DimentionResult> {
  const volumeResponse = options.preFetchedResults || [];
  const dailyVolume = Number(Number(volumeResponse[0]?.spot_volume || 0).toFixed(0))
  return { dailyVolume };
}

async function fetch(_t: any, _tt: any, options: FetchOptions) {
  const results = await getSpotDimensions(options);
  return {
    ...results,
    timestamp: options.startOfDay
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2023-07-25',
    },
  },
  prefetch: prefetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;

import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { BreakdownAdapter, FetchOptions } from "../../adapters/types";

// const DUNE_QUERY_ID = "3756979"; // https://dune.com/queries/3756979/6318568
// const DUNE_QUERY_ID = "4057938"; // Should be faster than the above - https://dune.com/queries/3782153/6359334

type DimentionResult = {
  dailyVolume?: number;
  dailyFees?: number;
  dailyUserFees?: number;
  dailyRevenue?: number;
};

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {
  const sql = getSqlFromFile('helpers/queries/drift-protocol.sql', {
    start: options.startOfDay,
    end: options.startOfDay + 24 * 60 * 60
  });
  return queryDuneSql(options, sql);
};

async function getPerpDimensions(options: FetchOptions): Promise<DimentionResult> {
  const volumeResponse = options.preFetchedResults || [];
  const dailyVolume = Number(Number(volumeResponse[0]?.perpetual_volume || 0).toFixed(0))
  const dailyFees = Number(Number(volumeResponse[0]?.total_taker_fee || 0).toFixed(0))
  const dailyRevenue = Number(Number(volumeResponse[0]?.total_revenue || 0).toFixed(0))
  return { dailyVolume, dailyFees, dailyRevenue };
}

async function getSpotDimensions(options: FetchOptions): Promise<DimentionResult> {
  const volumeResponse = options.preFetchedResults || [];
  const dailyVolume = Number(Number(volumeResponse[0]?.spot_volume || 0).toFixed(0))
  return { dailyVolume };
}

async function fetch(type: "perp" | "spot", options: FetchOptions) {
  if (type === "perp") {
    const results = await getPerpDimensions(options);
    return {
      ...results,
      timestamp: options.startOfDay,
    };
  } else {
    const results = await getSpotDimensions(options);
    return {
      ...results,
      timestamp: options.startOfDay
    };
  }
}

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) => fetch("spot", options),
        start: '2023-07-25',
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) => fetch("perp", options),
        start: '2023-07-25',
      },
    },
  },
  prefetch: prefetch,
  isExpensiveAdapter: true,
};

export default adapter;

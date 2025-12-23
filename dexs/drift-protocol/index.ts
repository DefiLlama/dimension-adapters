import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { BreakdownAdapter, Dependencies, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

// Both v2 and v3 use the same program address: dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
// v3 launched on 2025-12-04 - same contract, same event structure, no code changes required for now
// Potential changes Q1 2026 when DLP pools launch
// https://www.drift.trade/updates/introducing-drift-v3-built-to-outperform

// const DUNE_QUERY_ID = "3756979"; // https://dune.com/queries/3756979/6318568
// const DUNE_QUERY_ID = "4057938"; // Should be faster than the above - https://dune.com/queries/3782153/6359334

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

async function getPerpDimensions(options: FetchOptions): Promise<DimentionResult> {
  const volumeResponse = options.preFetchedResults || [];
  const dailyVolume = Number(Number(volumeResponse[0]?.perpetual_volume || 0).toFixed(0))
  const dailyFees = Number(Number(volumeResponse[0]?.total_taker_fee || 0).toFixed(0))
  const dailyRevenue = Number(Number(volumeResponse[0]?.total_revenue || 0).toFixed(0))
  
  // Fetch open interest data from Drift API
  const contractsResponse = await fetchURL('https://data.api.drift.trade/contracts');
  const openInterestAtEnd = contractsResponse.contracts
    .filter((contract: any) => contract.product_type === 'PERP')
    .reduce((acc: number, contract: any) => {
      const openInterest = parseFloat(contract.open_interest);
      const lastPrice = parseFloat(contract.last_price);
      return acc + (openInterest * lastPrice);
    }, 0);
  
  return { dailyVolume, dailyFees, dailyRevenue, openInterestAtEnd };
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
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
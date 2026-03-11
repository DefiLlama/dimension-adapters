import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

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

async function fetch(_t: any, _tt: any, options: FetchOptions) {
  const results = await getPerpDimensions(options);
  return {
    ...results,
    timestamp: options.startOfDay,
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

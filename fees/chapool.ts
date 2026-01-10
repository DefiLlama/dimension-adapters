import { Adapter, Dependencies, FetchOptions, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetch = async (_timestamp: number, _: any, options: FetchOptions): Promise<FetchResult> => {
  const preFetchedResults = options.preFetchedResults;
  const dailyRevenueData = preFetchedResults.dailyRevenue || [];
  const dailyVolumeData = preFetchedResults.dailyVolume || [];
  const totalRevenueData = preFetchedResults.totalRevenue || [];

  // Dune dates are usually strings like "2023-01-01 00:00:00"
  const dayStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0];

  const dailyRevRow = dailyRevenueData.find((row: any) => {
    // handle potential date format differences
    const rowDate = row.date ? row.date.toString().split('T')[0] : "";
    return rowDate === dayStr;
  });

  const dailyVolRow = dailyVolumeData.find((row: any) => {
    const rowDate = row.date ? row.date.toString().split('T')[0] : "";
    return rowDate === dayStr;
  });

  const dailyRevenue = dailyRevRow ? dailyRevRow.daily_net_usdt : undefined;
  const dailyVolume = dailyVolRow ? dailyVolRow.daily_volume_usd : undefined;
  
  // Total revenue is a single value, not daily cumulative in this query context (it's total to date)
  // We generally return the latest total revenue available
  const totalRevenueRow = totalRevenueData[0];
  const totalRevenue = totalRevenueRow ? (totalRevenueRow.total_received_usdt - totalRevenueRow.total_withdrawn_usdt) : undefined;

  return {
    dailyFees: dailyRevenue, // Assuming fees = revenue for this protocol based on description
    dailyRevenue: dailyRevenue,
    dailyVolume: dailyVolume,
    totalRevenue: totalRevenue,
    timestamp: options.startOfDay,
  };
}

const prefetch = async (options: FetchOptions) => {
  const [totalRevenue, dailyRevenue, dailyVolume] = await Promise.all([
    queryDune("6441606", {}, options),
    queryDune("6292099", {}, options),
    queryDune("6494471", {}, options)
  ]);

  return {
    totalRevenue,
    dailyRevenue,
    dailyVolume
  };
}

const methodology = {
  Fees: "Net revenue from payments and refunds",
  Revenue: "Net revenue from payments and refunds",
  Volume: "Total user payment volume",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OP_BNB]: {
      fetch: fetch,
      start: '2024-12-01', // Approximate start date based on block number in query
      runAtCurrTime: true,
    }
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
}

export default adapter;

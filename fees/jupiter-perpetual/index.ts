import { Dependencies, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {

  // Use the new decoded query for better performance
  const sql = getSqlFromFile("helpers/queries/jupiter-perpetual.sql", {
    start: options.startTimestamp - (7 * 24 * 60 * 60), // 7 days before start
    end: options.endTimestamp
  });
  const data: any[] = (await queryDuneSql(options, sql));
  
  // Filter data for the requested date range
  const startDate = new Date(options.startTimestamp * 1000);
  const endDate = new Date(options.endTimestamp * 1000);
  
  const filteredData = data.filter(row => {
    const rowDate = new Date(row.day);
    return rowDate >= startDate && rowDate <= endDate;
  });
  
  // Sum up the total fees for the filtered period
  const dailyFees = filteredData.reduce((sum, row) => sum + (row.total_fees || 0), 0);

  return {
    dailyFees,
    dailyRevenue: `${dailyFees * (25 / 100)}`,
    dailyHoldersRevenue: `${(dailyFees * (25 / 100)) * (50 / 100)}`,
    dailyProtocolRevenue: `${(dailyFees * (25 / 100)) * (50 / 100)}`,
    dailySupplySideRevenue: `${dailyFees * (75 / 100)}`,
  }
};

const adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2024-01-23',
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees paid by users to open/close positions for perps",
    Revenue: "25% of total fees goes to protocol tresuary + JLP holders",
    ProtocolRevenue: "50% of revenue (12.5% of total fees) goes to protocol treasury",
    HoldersRevenue: "50% of revenue (12.5% of total fees) goes to JUP holders", 
    SupplySideRevenue: "75% of total fees goes to liquidity providers",
  },
};

export default adapter;

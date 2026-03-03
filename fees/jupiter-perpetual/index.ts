import {
  Dependencies,
  FetchOptions,
  FetchResultV2,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { jupBuybackRatioFromRevenue, JUPITER_METRICS } from "../jupiter";

const fetch = async (
  _a: any,
  _b: any,
  options: FetchOptions,
): Promise<FetchResultV2> => {
  // Use the new decoded query for better performance
  const sql = getSqlFromFile("helpers/queries/jupiter-perpetual.sql", {
    start: options.startTimestamp - 2 * 24 * 60 * 60, // 2 days before start
    end: options.endTimestamp,
  });
  const data: any[] = await queryDuneSql(options, sql);

  // Filter data for the requested date range
  const startDate = new Date(options.startTimestamp * 1000);
  const endDate = new Date(options.endTimestamp * 1000);

  const filteredData = data.filter((row) => {
    const rowDate = new Date(row.day);
    return rowDate >= startDate && rowDate <= endDate;
  });

  // Sum up the total fees for the filtered period
  const perpsFee = filteredData.reduce(
    (sum, row) => sum + (row.total_fees || 0),
    0,
  );
  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addUSDValue(perpsFee, JUPITER_METRICS.JupPerpsFees);
  dailySupplySideRevenue.addUSDValue(
    perpsFee * 0.75,
    JUPITER_METRICS.JupPerpsFeesToLPs,
  );
  dailyRevenue.addUSDValue(
    perpsFee * 0.25,
    JUPITER_METRICS.JupPerpsFeesToLJupiter,
  );
  dailyHoldersRevenue.addUSDValue(
    perpsFee * 0.25 * buybackRatio,
    JUPITER_METRICS.TokenBuyBack,
  );
  dailyProtocolRevenue.addUSDValue(
    perpsFee * 0.25 * (1 - buybackRatio),
    JUPITER_METRICS.JupPerpsFeesToLJupiter,
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2024-01-23",
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees paid by users to open/close positions for perps",
    Revenue: "25% of total fees goes to protocol tresuary and JUP holders",
    ProtocolRevenue:
      "50% of revenue (12.5% of total fees) goes to protocol treasury, it was 100% before 2025-02-17",
    HoldersRevenue:
      "From 2025-02-17, 50% of revenue (12.5% of total fees) goes to JUP holders",
    SupplySideRevenue: "75% of total fees goes to liquidity providers",
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupPerpsFees]:
        "Fees paid by users to open/close positions for perps",
    },
    Revenue: {
      [JUPITER_METRICS.JupPerpsFeesToLJupiter]:
        "25% of total fees goes to protocol tresuary and JUP holders",
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.JupPerpsFeesToLPs]:
        "75% of total fees goes to liquidity providers.",
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupPerpsFeesToLJupiter]:
        "50% of revenue (12.5% of total fees) goes to protocol treasury, it was 100% before 2025-02-17",
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]:
        "From 2025-02-17, 50% of revenue (12.5% of total fees) goes to JUP holders",
    },
  },
};

export default adapter;

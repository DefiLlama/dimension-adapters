import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {

  const sql = getSqlFromFile("helpers/queries/jupiter-lend.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const data: any[] = await queryDuneSql(options, sql);

  const df = data.reduce((sum, row) => sum + (row.daily_fees_usd || 0), 0);
  const dssr = data.reduce((sum, row) => sum + (row.daily_supply_side_revenue_usd || 0), 0);
  const dr = data.reduce((sum, row) => sum + (row.daily_revenue_usd || 0), 0);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(df, METRIC.BORROW_INTEREST);
  dailySupplySideRevenue.addUSDValue(dssr, METRIC.BORROW_INTEREST);
  dailyRevenue.addUSDValue(Number(dr) * 0.5, METRIC.BORROW_INTEREST);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-07-24',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: 'All interest paid by borrowers from all markets.',
    Revenue: 'Amount of interest distributed to lenders from all market(50% goes to jupiter, other 50% to Fluid).',
    ProtocolRevenue: '50% of the revenue goes to jupiter.',
    SupplySideRevenue: 'Interest distributed to lenders from all markets.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all market(50% goes to jupiter, other 50% to Fluid).',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Interest distributed to lenders from all markets.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: '50% of the revenue goes to jupiter.',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;

import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "../jupiter";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {

  const sql = getSqlFromFile("helpers/queries/jupiter-lend.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const data: any[] = await queryDuneSql(options, sql);

  const df = data.reduce((sum, row) => sum + (row.daily_fees_usd || 0), 0);
  const dssrToLenders = data.reduce((sum, row) => sum + (row.daily_supply_side_revenue_usd || 0), 0);
  const drBeforeFluidShare = data.reduce((sum, row) => sum + (row.daily_revenue_usd || 0), 0);
  const drFluidShare = drBeforeFluidShare * 0.5;
  const dr = drBeforeFluidShare - drFluidShare;

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // all borrow interest from lend markets
  dailyFees.addUSDValue(df, JUPITER_METRICS.BorrowInterest);

  // share of interest to lenders
  dailySupplySideRevenue.addUSDValue(dssrToLenders, JUPITER_METRICS.InterestToLenders);
  
  // share of interest to Fluid
  dailySupplySideRevenue.addUSDValue(drFluidShare, JUPITER_METRICS.InterestToFluid);

  // share of interest to Jupiter + JUP token holders
  dailyRevenue.addUSDValue(dr, JUPITER_METRICS.InterestToJupiter);
  
  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
  
  // 50% revenue to Jupiter
  dailyProtocolRevenue.addUSDValue(dr * (1 - buybackRatio), JUPITER_METRICS.InterestToJupiter);
  
  // 50% revenue to JUP buy back
  dailyHoldersRevenue.addUSDValue(dr * buybackRatio, JUPITER_METRICS.TokenBuyBack);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
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
    Revenue: 'Amount of interest share to Jupiter and JUP token holders.',
    ProtocolRevenue: '50% of the revenue goes to jupiter, it was 100% before 2025-02-17.',
    HoldersRevenue: 'From 2025-02-17, 50% of the revenue goes to JUP token holders via buy back.',
    SupplySideRevenue: 'Amount of interest distributed to lenders and Fluid from all market.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.BorrowInterest]: 'All interest paid by borrowers from all markets.',
    },
    Revenue: {
      [JUPITER_METRICS.InterestToJupiter]: 'Amount of interest cut collected by Jupiter, (50% goes to jupiter, other 50% to Fluid).',
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.InterestToLenders]: 'Interest distributed to lenders from all markets.',
      [JUPITER_METRICS.InterestToFluid]: 'Interest distributed to Fluid from all markets.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.InterestToJupiter]: '50% of the revenue goes to Jupiter.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'From 2025-02-17, 50% of the revenue are used to buy back JUP.',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;

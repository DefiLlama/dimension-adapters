import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { JUPITER_METRICS } from "../jupiter";
import { queryDuneSql } from "../../helpers/dune";
import { assertDuneSolanaIndexed } from "../../helpers/duneSolanaDex";

// Jupiter Lend runs on Fluid infra as two instances tagged by `instance_name`
// in the Dune MV: the main Jupiter markets and the isolated Ethena (USDe) market
// curated by Bitwise. Both share the same on-chain fee model (a reserve cut on
// borrower interest) and the same 50/50 Jupiter/Fluid revenue share, so we apply
// identical logic to each instance and only relabel for the breakdown.
//
// Interest accrues in the liquidity program jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC and the lending program
// jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9.
// Kept onchain instead of Jupiter's stats API: the numbers match, and the API has no per-market or per-party breakdown.
const ETHENA_METRICS = {
  BorrowInterest: 'JupLend Ethena Isolated Market Borrow Interests',
  InterestToLenders: 'JupLend Ethena Isolated Market Borrow Interests To Lenders',
  InterestToFluid: 'JupLend Ethena Isolated Market Borrow Interests To Fluid',
  InterestToJupiter: 'JupLend Ethena Isolated Market Borrow Interests To Jupiter',
};

const isEthenaInstance = (row: any) => String(row.instance_name || '').toLowerCase().includes('ethena');
const sumUsd = (rows: any[], key: string) => rows.reduce((sum, row) => sum + (row[key] || 0), 0);

export const queryJupLendRows = async (options: FetchOptions): Promise<any[]> => {
  assertDuneSolanaIndexed(options);

  const sql = `
    select
        day >= FROM_UNIXTIME(${options.endTimestamp}) as after_window
      , instance_name
      , sum(borrow_fees_usd) as daily_fees_usd
      , sum(supply_side_fees_usd) as daily_supply_side_revenue_usd
      , sum(day_revenue_usd) as daily_revenue_usd
    from dune."jupiter".result_juplend_historical_tvl_by_token_mv
    where day >= FROM_UNIXTIME(${options.startTimestamp})
        and day < FROM_UNIXTIME(${options.endTimestamp + 86400})
    group by 1, 2
  `
  const rows: any[] = await queryDuneSql(options, sql);
  const dayRows = rows.filter((row) => !row.after_window);

  if (!dayRows.length) throw new Error(`No JupLend data returned from Dune for ${options.dateString}`);
  if (dayRows.length === rows.length) throw new Error(`JupLend Dune MV has not refreshed past ${options.dateString}, its row may be partial`);

  return dayRows;
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const data = await queryJupLendRows(options);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const addInstance = (rows: any[], metrics: typeof JUPITER_METRICS | typeof ETHENA_METRICS) => {
    const df = sumUsd(rows, 'daily_fees_usd');
    const dssrToLenders = sumUsd(rows, 'daily_supply_side_revenue_usd');
    const drBeforeFluidShare = sumUsd(rows, 'daily_revenue_usd');
    const drFluidShare = drBeforeFluidShare * 0.5;
    const dr = drBeforeFluidShare - drFluidShare;

    // all borrow interest from this instance's markets
    dailyFees.addUSDValue(df, metrics.BorrowInterest);

    // share of interest to lenders
    dailySupplySideRevenue.addUSDValue(dssrToLenders, metrics.InterestToLenders);

    // share of interest to Fluid
    dailySupplySideRevenue.addUSDValue(drFluidShare, metrics.InterestToFluid);

    // share of interest to Jupiter, all kept by Jupiter
    dailyRevenue.addUSDValue(dr, metrics.InterestToJupiter);
  };

  // main Jupiter markets keep the existing labels; the isolated Ethena market
  // is broken out under its own labels so the totals stay unchanged.
  addInstance(data.filter((row) => !isEthenaInstance(row)), JUPITER_METRICS);
  addInstance(data.filter(isEthenaInstance), ETHENA_METRICS);

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
  start: '2025-08-05',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: 'All interest paid by borrowers from all markets.',
    Revenue: "Jupiter's share of borrow interest, half of the reserve cut (the other half goes to Fluid).",
    ProtocolRevenue: "All of Jupiter's share, kept by Jupiter. Not used for JUP buybacks.",
    SupplySideRevenue: 'Amount of interest distributed to lenders and Fluid from all market.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.BorrowInterest]: 'All interest paid by borrowers from all markets.',
      [ETHENA_METRICS.BorrowInterest]: 'Interest paid by borrowers in the isolated Ethena (USDe) market curated by Bitwise.',
    },
    Revenue: {
      [JUPITER_METRICS.InterestToJupiter]: 'Amount of interest cut collected by Jupiter, (50% goes to jupiter, other 50% to Fluid).',
      [ETHENA_METRICS.InterestToJupiter]: 'Jupiter interest cut from the isolated Ethena (USDe) market (50% to Jupiter, 50% to Fluid).',
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.InterestToLenders]: 'Interest distributed to lenders from all markets.',
      [JUPITER_METRICS.InterestToFluid]: 'Interest distributed to Fluid from all markets.',
      [ETHENA_METRICS.InterestToLenders]: 'Interest distributed to lenders in the isolated Ethena (USDe) market.',
      [ETHENA_METRICS.InterestToFluid]: 'Interest distributed to Fluid from the isolated Ethena (USDe) market.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.InterestToJupiter]: "All of Jupiter's interest cut, kept by Jupiter.",
      [ETHENA_METRICS.InterestToJupiter]: "All of Jupiter's interest cut from the isolated Ethena (USDe) market, kept by Jupiter.",
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;

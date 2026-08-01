import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "../jupiter";
import { queryDuneSql } from "../../helpers/dune";

// Jupiter Lend runs on Fluid infra as two instances tagged by `instance_name`
// in the Dune MV: the main Jupiter markets and the isolated Ethena (USDe) market
// curated by Bitwise. Both share the same on-chain fee model (a reserve cut on
// borrower interest) and the same 50/50 Jupiter/Fluid revenue share, so we apply
// identical logic to each instance and only relabel for the breakdown.
const ETHENA_METRICS = {
  BorrowInterest: 'JupLend Ethena Isolated Market Borrow Interests',
  InterestToLenders: 'JupLend Ethena Isolated Market Borrow Interests To Lenders',
  InterestToFluid: 'JupLend Ethena Isolated Market Borrow Interests To Fluid',
  InterestToJupiter: 'JupLend Ethena Isolated Market Borrow Interests To Jupiter',
};

const isEthenaInstance = (row: any) => String(row.instance_name || '').toLowerCase().includes('ethena');
const sumUsd = (rows: any[], key: string) => rows.reduce((sum, row) => sum + (row[key] || 0), 0);

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {

  // const sql = getSqlFromFile("helpers/queries/jupiter-lend.sql", {
  //   start: options.startTimestamp,
  //   end: options.endTimestamp
  // });
  const sql = `
    select
        day
      , instance_name
      , sum(borrow_fees_usd) as daily_fees_usd
      , sum(supply_side_fees_usd) as daily_supply_side_revenue_usd
      , sum(day_revenue_usd) as daily_revenue_usd
    from dune."0xfluid".result_juplend_historical_tvl_by_token_mv
    where day >= FROM_UNIXTIME(${options.startTimestamp})
        and day < FROM_UNIXTIME(${options.endTimestamp})
    group by 1, 2
    order by day desc
  `
  const data: any[] = await queryDuneSql(options, sql);

  if (!data || data.length === 0) {
    throw new Error(`No JupLend data returned from Dune for day starting ${new Date(options.startTimestamp * 1000).toISOString()}`);
  }

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);

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

    // share of interest to Jupiter + JUP token holders
    dailyRevenue.addUSDValue(dr, metrics.InterestToJupiter);

    // 50% revenue to Jupiter
    dailyProtocolRevenue.addUSDValue(dr * (1 - buybackRatio), metrics.InterestToJupiter);

    // 50% revenue to JUP buy back (protocol-wide, same buyback label for both instances)
    dailyHoldersRevenue.addUSDValue(dr * buybackRatio, JUPITER_METRICS.TokenBuyBack);
  };

  // main Jupiter markets keep the existing labels; the isolated Ethena market
  // is broken out under its own labels so the totals stay unchanged.
  addInstance(data.filter((row) => !isEthenaInstance(row)), JUPITER_METRICS);
  addInstance(data.filter(isEthenaInstance), ETHENA_METRICS);

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
      [JUPITER_METRICS.InterestToJupiter]: '50% of the revenue goes to Jupiter.',
      [ETHENA_METRICS.InterestToJupiter]: '50% of the isolated Ethena (USDe) market revenue goes to Jupiter.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'From 2025-02-17, 50% of the revenue are used to buy back JUP.',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;

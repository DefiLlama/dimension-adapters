import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "../jupiter";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {
  const sql = getSqlFromFile("helpers/queries/jupiter-lend-ethena.sql", {
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

  dailyFees.addUSDValue(df, JUPITER_METRICS.BorrowInterest);
  dailySupplySideRevenue.addUSDValue(dssrToLenders, JUPITER_METRICS.InterestToLenders);
  dailySupplySideRevenue.addUSDValue(drFluidShare, JUPITER_METRICS.InterestToFluid);
  dailyRevenue.addUSDValue(dr, JUPITER_METRICS.InterestToJupiter);

  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
  dailyProtocolRevenue.addUSDValue(dr * (1 - buybackRatio), JUPITER_METRICS.InterestToJupiter);
  dailyHoldersRevenue.addUSDValue(dr * buybackRatio, JUPITER_METRICS.TokenBuyBack);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-05-13',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: 'All interest paid by borrowers in the Jupiter Lend Ethena isolated market. Covers USDe/USDG (~$251M active vault), WSOL/USDe (near-dormant), and USDe savings vault. WSOL/USDG vault excluded as it is not USDe-routed.',
    Revenue: 'Amount of interest share to Jupiter and JUP token holders.',
    ProtocolRevenue: '50% of the revenue goes to Jupiter.',
    HoldersRevenue: '50% of the revenue goes to JUP token holders via buy back.',
    SupplySideRevenue: 'Amount of interest distributed to lenders and Fluid from the Ethena market.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.BorrowInterest]: 'All interest paid by borrowers in the Ethena USDe market.',
    },
    Revenue: {
      [JUPITER_METRICS.InterestToJupiter]: 'Jupiter share of interest (50% of protocol cut, other 50% to Fluid).',
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.InterestToLenders]: 'Interest distributed to USDe lenders.',
      [JUPITER_METRICS.InterestToFluid]: 'Interest distributed to Fluid.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.InterestToJupiter]: '50% of the revenue goes to Jupiter.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: '50% of the revenue used to buy back JUP.',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;

import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "../jupiter";
import { queryDuneSql } from "../../helpers/dune";

const USDE_MINT = 'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT';

const ETHENA_METRICS = {
  ...JUPITER_METRICS,
  RevenueShareToEthena: 'Revenue Share To Ethena',
};

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {
  const sql = `
    select
        day
      , sum(borrow_fees_usd) as daily_fees_usd
      , sum(supply_side_fees_usd) as daily_supply_side_revenue_usd
      , sum(day_revenue_usd) as daily_revenue_usd
    from dune."0xfluid".result_juplend_historical_tvl_by_token_mv
    where mint = '${USDE_MINT}'
      and day >= FROM_UNIXTIME(${options.startTimestamp})
      and day < FROM_UNIXTIME(${options.endTimestamp})
    group by 1
    order by day desc
  `;

  const data: any[] = await queryDuneSql(options, sql);

  const df = data.reduce((sum, row) => sum + (row.daily_fees_usd || 0), 0);
  const dssr = data.reduce((sum, row) => sum + (row.daily_supply_side_revenue_usd || 0), 0);
  const drBeforeFluidShare = data.reduce((sum, row) => sum + (row.daily_revenue_usd || 0), 0);

  // Fluid takes 50% of protocol cut
  const drFluidShare = drBeforeFluidShare * 0.5;
  const dr = drBeforeFluidShare - drFluidShare;

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(df, ETHENA_METRICS.BorrowInterest);
  dailySupplySideRevenue.addUSDValue(dssr, ETHENA_METRICS.InterestToLenders);
  dailySupplySideRevenue.addUSDValue(drFluidShare, ETHENA_METRICS.InterestToFluid);
  dailyRevenue.addUSDValue(dr, ETHENA_METRICS.InterestToJupiter);

  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
  dailyProtocolRevenue.addUSDValue(dr * (1 - buybackRatio), ETHENA_METRICS.InterestToJupiter);
  dailyHoldersRevenue.addUSDValue(dr * buybackRatio, ETHENA_METRICS.TokenBuyBack);

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
    Fees: 'All interest paid by borrowers in the Jupiter Lend Ethena (USDe) isolated market.',
    Revenue: 'Jupiter share of interest (50% after Fluid takes its cut).',
    ProtocolRevenue: '50% of Jupiter revenue goes to protocol.',
    HoldersRevenue: '50% of Jupiter revenue goes to JUP token holders via buy back.',
    SupplySideRevenue: 'Interest to USDe lenders and Fluid revenue share. Ethena revenue share to be added once column name confirmed.',
  },
  breakdownMethodology: {
    Fees: {
      [ETHENA_METRICS.BorrowInterest]: 'Interest paid by borrowers in Ethena USDe market.',
    },
    Revenue: {
      [ETHENA_METRICS.InterestToJupiter]: 'Jupiter share after Fluid takes 50%.',
    },
    SupplySideRevenue: {
      [ETHENA_METRICS.InterestToLenders]: 'Interest distributed to USDe lenders.',
      [ETHENA_METRICS.InterestToFluid]: 'Fluid 50% share of protocol interest.',
    },
    ProtocolRevenue: {
      [ETHENA_METRICS.InterestToJupiter]: '50% of Jupiter revenue to protocol.',
    },
    HoldersRevenue: {
      [ETHENA_METRICS.TokenBuyBack]: '50% of Jupiter revenue to JUP buyback.',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;

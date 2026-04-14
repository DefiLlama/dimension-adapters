import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql, queryDuneResult } from "../../helpers/dune";
import { jupBuybackRatioFromRevenue, JUPITER_METRICS } from "../jupiter";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const sql = getSqlFromFile("helpers/queries/jupiter-perpetual.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });

  let data: any[] = [];
  if (options.startOfDay > 1774656000) {
    data = await queryDuneSql(options, sql);
  } else {
    const alldata = await queryDuneResult(options, '6919084')
    const targetDate = options.dateString
    const matched = alldata.find(
      (row: any) => typeof row.day === 'string' && row.day.slice(0, 10) === targetDate,
    )
    data = matched ? [matched] : []
    if(!data || !data.length) {
      throw new Error(`No data found for date ${options.dateString}, fix cache result query`)
    }
  }

  const totals = data.reduce(
    (acc, row) => {
      acc.addLiqFees += row.add_liquidity_fees || 0;
      acc.removeLiqFees += row.remove_liquidity_fees || 0;
      acc.swapFees += row.swap_fees || 0;
      acc.openFees += row.open_fees || 0;
      acc.closeFees += row.close_fees || 0;
      acc.liquidationFees += row.liquidation_fees || 0;
      acc.fundingFees += row.funding_fees || 0;
      acc.priceImpactFees += row.price_impact_fees || 0;
      acc.totalFees += row.total_fees || 0;
      return acc;
    },
    {
      addLiqFees: 0,
      removeLiqFees: 0,
      swapFees: 0,
      openFees: 0,
      closeFees: 0,
      liquidationFees: 0,
      fundingFees: 0,
      priceImpactFees: 0,
      totalFees: 0,
    },
  );

  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(totals.addLiqFees, JUPITER_METRICS.JupPerpsAddLiquidityFees);
  dailyFees.addUSDValue(totals.removeLiqFees, JUPITER_METRICS.JupPerpsRemoveLiquidityFees);
  dailyFees.addUSDValue(totals.swapFees, JUPITER_METRICS.JupPerpsSwapFees);
  dailyFees.addUSDValue(totals.openFees, JUPITER_METRICS.JupPerpsOpenPositionFees);
  dailyFees.addUSDValue(totals.closeFees, JUPITER_METRICS.JupPerpsClosePositionFees);
  dailyFees.addUSDValue(totals.liquidationFees, JUPITER_METRICS.JupPerpsLiquidationFees);
  dailyFees.addUSDValue(totals.fundingFees, JUPITER_METRICS.JupPerpsFundingFees);
  dailyFees.addUSDValue(totals.priceImpactFees, JUPITER_METRICS.JupPerpsPriceImpactFees);

  const dailySupplySideRevenue = dailyFees.clone(0.75);
  const dailyRevenue = dailyFees.clone(0.25);
  const dailyHoldersRevenue = dailyRevenue.clone(buybackRatio);
  const dailyProtocolRevenue = dailyRevenue.clone(1 - buybackRatio);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "All fees paid by users including liquidity operations, swaps, trading positions, funding fees, and price impact",
  Revenue: "25% of total fees goes to protocol treasury and JUP holders",
  ProtocolRevenue: "50% of revenue (12.5% of total fees) goes to protocol treasury, it was 100% before 2025-02-17",
  HoldersRevenue: "From 2025-02-17, 50% of revenue (12.5% of total fees) goes to JUP holders",
  SupplySideRevenue: "75% of total fees goes to liquidity providers",
}

const breakdownMethodology = {
  Fees: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "Fees charged when users mint JLP to the pool",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "Fees charged when users burn JLP from the pool",
    [JUPITER_METRICS.JupPerpsSwapFees]: "Fees from swaps within the perpetual pool",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "Position fees charged when opening or increasing a perpetual position",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "Position fees charged when closing or decreasing a perpetual position",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "Fees collected from liquidating underwater positions",
    [JUPITER_METRICS.JupPerpsFundingFees]: "Funding fees paid by traders to maintain their positions, settled when positions are modified",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "Price impact fees charged on trades based on market conditions and imbalance, up to 0.44% of trade size",
  },
  Revenue: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "25% of mint JLP fees goes to protocol",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "25% of burn JLP fees goes to protocol",
    [JUPITER_METRICS.JupPerpsSwapFees]: "25% of swap fees goes to protocol",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "25% of open position fees goes to protocol",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "25% of close position fees goes to protocol",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "25% of liquidation fees goes to protocol",
    [JUPITER_METRICS.JupPerpsFundingFees]: "25% of funding fees goes to protocol",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "25% of price impact fees goes to protocol",
  },
  SupplySideRevenue: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "75% of mint JLP fees distributed to liquidity providers",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "75% of burn JLP fees distributed to liquidity providers",
    [JUPITER_METRICS.JupPerpsSwapFees]: "75% of swap fees distributed to liquidity providers",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "75% of open position fees distributed to liquidity providers",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "75% of close position fees distributed to liquidity providers",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "75% of liquidation fees distributed to liquidity providers",
    [JUPITER_METRICS.JupPerpsFundingFees]: "75% of funding fees distributed to liquidity providers",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "75% of price impact fees distributed to liquidity providers",
  },
  ProtocolRevenue: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "50% of protocol revenue from mint JLP fees (12.5% of total fees) goes to treasury, it was 100% before 2025-02-17",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "50% of protocol revenue from burn JLP fees (12.5% of total fees) goes to treasury, it was 100% before 2025-02-17",
    [JUPITER_METRICS.JupPerpsSwapFees]: "50% of protocol revenue from swap fees (12.5% of total fees) goes to treasury, it was 100% before 2025-02-17",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "50% of protocol revenue from open position fees (12.5% of total fees) goes to treasury, it was 100% before 2025-02-17",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "50% of protocol revenue from close position fees (12.5% of total fees) goes to treasury, it was 100% before 2025-02-17",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "50% of protocol revenue from liquidation fees (12.5% of total fees) goes to treasury, it was 100% before 2025-02-17",
    [JUPITER_METRICS.JupPerpsFundingFees]: "50% of protocol revenue from funding fees (12.5% of total fees) goes to treasury, it was 100% before 2025-02-17",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "50% of protocol revenue from price impact fees (12.5% of total fees) goes to treasury, it was 100% before 2025-02-17",
  },
  HoldersRevenue: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "From 2025-02-17, 50% of protocol revenue from mint JLP fees (12.5% of total fees) goes to JUP holders",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "From 2025-02-17, 50% of protocol revenue from burn JLP fees (12.5% of total fees) goes to JUP holders",
    [JUPITER_METRICS.JupPerpsSwapFees]: "From 2025-02-17, 50% of protocol revenue from swap fees (12.5% of total fees) goes to JUP holders",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "From 2025-02-17, 50% of protocol revenue from open position fees (12.5% of total fees) goes to JUP holders",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "From 2025-02-17, 50% of protocol revenue from close position fees (12.5% of total fees) goes to JUP holders",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "From 2025-02-17, 50% of protocol revenue from liquidation fees (12.5% of total fees) goes to JUP holders",
    [JUPITER_METRICS.JupPerpsFundingFees]: "From 2025-02-17, 50% of protocol revenue from funding fees (12.5% of total fees) goes to JUP holders",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "From 2025-02-17, 50% of protocol revenue from price impact fees (12.5% of total fees) goes to JUP holders",
  },
}

const adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-01-23",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology
};

export default adapter;

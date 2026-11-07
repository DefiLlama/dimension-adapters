import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql, queryDuneResult } from "../../helpers/dune";
import { JUPITER_METRICS, jupTreasuryShare } from "../jupiter";

const fetch = async (options: FetchOptions) => {
  const sql = getSqlFromFile("helpers/queries/jupiter-perpetual.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });

  let data: any[] = [];
  if (options.startOfDay > 1793664000) {
    data = await queryDuneSql(options, sql);
    // JLP Loans interest comes from the USDC custody's 15-minute withdrawFees2 events: a day without them is missing data, not zero interest
    if (data.some((row: any) => !row.usdc_fee_withdrawals)) {
      throw new Error(`No USDC custody withdrawFees2 events found for date ${options.dateString}`)
    }
  } else {
    const alldata = await queryDuneResult(options, '9069874')
    const targetDate = options.dateString
    const matched = alldata.find(
      (row: any) => typeof row.day === 'string' && row.day.slice(0, 10) === targetDate,
    )
    data = matched ? [matched] : []
    if(!data || !data.length) {
      throw new Error(`No data found for date ${options.dateString}, fix cache result query`)
    }
    // a cached row without the staking and JLP Loans columns is missing data, not zero (genuine zeros are kept)
    if (data.some((row: any) => !('staking_rewards_sol' in row) || !('loan_interest' in row))) {
      throw new Error(`No staking_rewards_sol or loan_interest column found for date ${options.dateString}, fix cache result query`)
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
      acc.stakingRewardsSol += row.staking_rewards_sol || 0;
      acc.loanInterest += row.loan_interest || 0;
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
      stakingRewardsSol: 0,
      loanInterest: 0,
    },
  );

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(totals.addLiqFees, JUPITER_METRICS.JupPerpsAddLiquidityFees);
  dailyFees.addUSDValue(totals.removeLiqFees, JUPITER_METRICS.JupPerpsRemoveLiquidityFees);
  dailyFees.addUSDValue(totals.swapFees, JUPITER_METRICS.JupPerpsSwapFees);
  dailyFees.addUSDValue(totals.openFees, JUPITER_METRICS.JupPerpsOpenPositionFees);
  dailyFees.addUSDValue(totals.closeFees, JUPITER_METRICS.JupPerpsClosePositionFees);
  dailyFees.addUSDValue(totals.liquidationFees, JUPITER_METRICS.JupPerpsLiquidationFees);
  dailyFees.addUSDValue(totals.fundingFees, JUPITER_METRICS.JupPerpsFundingFees);
  dailyFees.addUSDValue(totals.priceImpactFees, JUPITER_METRICS.JupPerpsPriceImpactFees);
  dailyFees.addCGToken("solana", totals.stakingRewardsSol, JUPITER_METRICS.JupPerpsStakingRewards);
  dailyFees.addUSDValue(totals.loanInterest, JUPITER_METRICS.JupPerpsLoanInterest);

  // the program sends 25% of the pool's fees to Jupiter (7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP), 75% stays with JLP
  const dailySupplySideRevenue = dailyFees.clone(0.75);
  const dailyRevenue = dailyFees.clone(0.25);
  // JUP buybacks are reported once, on the Jupiter Aggregator listing (fees/jupiter.ts), so no holders revenue here
  const dailyProtocolRevenue = dailyRevenue.clone(jupTreasuryShare(options.startOfDay));

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading, swap, borrow, liquidation and JLP mint/burn fees paid by users, plus staking rewards on the pool's SOL and JLP Loans interest.",
  Revenue: "25% of all fees, sent to Jupiter.",
  ProtocolRevenue: "Half of the 25% of fees sent to Jupiter, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
  SupplySideRevenue: "75% of all fees, kept by the JLP pool for liquidity providers.",
}

const breakdownMethodology = {
  Fees: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "Fees paid to mint JLP.",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "Fees paid to burn JLP.",
    [JUPITER_METRICS.JupPerpsSwapFees]: "Fees on swaps through the JLP pool.",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "Fees paid to open or increase a position.",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "Fees paid to close or decrease a position.",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "Fees paid on liquidated positions.",
    [JUPITER_METRICS.JupPerpsFundingFees]: "Borrow fees paid by traders on open positions.",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "Price impact fees paid on trades.",
    [JUPITER_METRICS.JupPerpsStakingRewards]: "Staking rewards on the SOL the JLP pool stakes.",
    [JUPITER_METRICS.JupPerpsLoanInterest]: "Interest paid by JLP Loans borrowers, counted from 2025-12-15, when the program started logging it.",
  },
  Revenue: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "25% of JLP mint fees, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "25% of JLP burn fees, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsSwapFees]: "25% of swap fees, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "25% of open position fees, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "25% of close position fees, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "25% of liquidation fees, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsFundingFees]: "25% of borrow fees, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "25% of price impact fees, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsStakingRewards]: "25% of SOL staking rewards, sent to Jupiter.",
    [JUPITER_METRICS.JupPerpsLoanInterest]: "25% of JLP Loans interest, sent to Jupiter.",
  },
  ProtocolRevenue: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "Half of the 25% of JLP mint fees sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "Half of the 25% of JLP burn fees sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsSwapFees]: "Half of the 25% of swap fees sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "Half of the 25% of open position fees sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "Half of the 25% of close position fees sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "Half of the 25% of liquidation fees sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsFundingFees]: "Half of the 25% of borrow fees sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "Half of the 25% of price impact fees sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsStakingRewards]: "Half of the 25% of SOL staking rewards sent to Jupiter, kept by the treasury.",
    [JUPITER_METRICS.JupPerpsLoanInterest]: "Half of the 25% of JLP Loans interest sent to Jupiter, kept by the treasury.",
  },
  SupplySideRevenue: {
    [JUPITER_METRICS.JupPerpsAddLiquidityFees]: "75% of JLP mint fees, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsRemoveLiquidityFees]: "75% of JLP burn fees, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsSwapFees]: "75% of swap fees, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsOpenPositionFees]: "75% of open position fees, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsClosePositionFees]: "75% of close position fees, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsLiquidationFees]: "75% of liquidation fees, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsFundingFees]: "75% of borrow fees, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsPriceImpactFees]: "75% of price impact fees, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsStakingRewards]: "75% of SOL staking rewards, kept by the JLP pool.",
    [JUPITER_METRICS.JupPerpsLoanInterest]: "75% of JLP Loans interest, kept by the JLP pool.",
  },
}

const adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2023-10-01",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology
};

export default adapter;

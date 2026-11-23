import { FetchOptions } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { getLiquityV2LogAdapter } from "../helpers/liquity"
import { METRIC } from "../helpers/metrics";
import { METRICS } from "../helpers/liquity";

// https://docs.liquity.org/v2-faq/lqty-staking#docs-internal-guid-266699b3-7fff-4534-ba95-bd541a00496d
const stabilityPoolRatio = 0.75;
const revenueRatio = 0.25;

// Known exploits that borrowed BOLD through troves opened and closed in the same tx; their fees are excluded
const exploitBlockRanges: [number, number][] = [
  // sBOLD vault exploit, 2026-11-18 12:00-12:20 UTC: 96 txs each borrowed ~9M BOLD from a wstETH flash trove,
  // then redeemed the proceeds (e.g. 0xaa3c7f00c5e449abb4d871b3fdad91e44d6a61c7d83c36eff23faf783d4e84cf)
  [26441929, 26442018],
]

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  
  const v0DeploymentRes = await getLiquityV2LogAdapter({ collateralRegistry: '0xd99dE73b95236F69A559117ECD6F519Af780F3f7', stabilityPoolRatio, revenueRatio, })(options)
  dailyFees.addBalances(v0DeploymentRes.dailyFees)
  dailyRevenue.addBalances(v0DeploymentRes.dailyRevenue)
  dailySupplySideRevenue.addBalances(v0DeploymentRes.dailySupplySideRevenue)
  
  if (options.startTimestamp >= 1747526400) {
    const v1DeploymentRes = await getLiquityV2LogAdapter({ collateralRegistry: '0xf949982b91c8c61e952b3ba942cbbfaef5386684', stabilityPoolRatio, revenueRatio, exploitBlockRanges, })(options)
    dailyFees.addBalances(v1DeploymentRes.dailyFees)
    dailyRevenue.addBalances(v1DeploymentRes.dailyRevenue)
    dailySupplySideRevenue.addBalances(v1DeploymentRes.dailySupplySideRevenue)
  }
  
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, }
}

export default {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2025-01-24',
  chains: [CHAIN.ETHEREUM],
  methodology: {
    Fees: 'Total interest, redemption fees paid by borrowers and liquidation gas compensate. Excludes the transactions of the 2026-11-18 sBOLD exploit, which opened and closed a trove in the same transaction.',
    Revenue: '25% of borrow interests are collected as protocol liquidity incentives.',
    SupplySideRevenue: '75% of borrow interests to stability pools takers, all redemption fees paid to borrowers and all gas compensations to liquidators.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Borrow interests paid by borrowers.',
      [METRICS.RedemptionFee]: 'Redemption fees paid by borrowers.',
      [METRICS.GasCompensation]: 'Gas compensations paid to liquidator when trigger liquidations.',
    },
    Revenue: {
      [METRICS.ProtocolIncentivizedLiquidity]: '25% of borrow interests collected as protocol liquidity incentives.',
    },
    SupplySideRevenue: {
      [METRICS.BorrowInterestToStabilityPools]: '75% of borrow interests to stability pools stakers.',
      [METRICS.RedemptionFeeToBorrowers]: 'All redemtion fees are distributed to borrowers.',
      [METRICS.GasCompensation]: 'All gas compensations paid to liquidator when trigger liquidations.',
    },
  },
}
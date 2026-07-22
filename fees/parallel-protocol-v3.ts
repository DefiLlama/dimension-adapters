import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const config: Record<string, { parallelizer: string; start: string }> = {
  [CHAIN.AVAX]: {
    parallelizer: "0x41d58951cbd12D4Ef49b0437897677bbF5547C80",
    start: "2025-09-03",
  },
  [CHAIN.ETHEREUM]: {
    parallelizer: "0x6efeDDF9269c3683Ba516cb0e2124FE335F262a2",
    start: "2025-06-10",
  },
  [CHAIN.BASE]: {
    parallelizer: "0xC3BEF21Ea7dEB5C34CF33E918c8e28972C8048eD",
    start: "2025-06-20",
  },
  [CHAIN.HYPERLIQUID]: {
    parallelizer: "0x1250304F66404cd153fA39388DDCDAec7E0f1707",
    start: "2025-06-07",
  },
};

// https://docs.parallel.best/products/parallel-v3/stablecoins-and-savings/usdp-and-susdp/fee-distribution
// 90% sUSDp holders, 9% DAO Treasury
// 1% paid to Angle Labs under BUSL 1.1 license (PIP-50) until expiry on June 1, 2026
const SUSDP_RATIO = 0.90;
const DAO_RATIO = 0.09;
const ANGLE_LABS_RATIO = 0.01;
const ANGLE_LABS_LICENSE_EXPIRY = Math.floor(new Date("2026-06-01").getTime() / 1000);

const ABI = "function getCollateralRatio() view returns (uint64 collatRatio, uint256 stablecoinsIssued)";

const fetch = async (options: FetchOptions) => {
  const { createBalances, chain, fromApi, toApi, toTimestamp } = options;
  const { parallelizer } = config[chain];

  const [[crStart, stablesStart], [crEnd, stablesEnd]] = await Promise.all([
    fromApi.call({ abi: ABI, target: parallelizer }),
    toApi.call({ abi: ABI, target: parallelizer }),
  ]);

  // Net surplus = (collatRatio / 1e9 - 1) * stablecoinsIssued — excess collateral above USDp backing (USDp = $1)
  // Daily fees = surplus delta: captures yield from yield-bearing collateral + 0.05% burn fees
  const surplusStart = (Number(crStart) / 1e9 - 1) * Number(stablesStart) / 1e18;
  const surplusEnd = (Number(crEnd) / 1e9 - 1) * Number(stablesEnd) / 1e18;
  const dailyFeesUSD = surplusEnd - surplusStart;

  const licenseActive = toTimestamp < ANGLE_LABS_LICENSE_EXPIRY;

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  dailyFees.addUSDValue(dailyFeesUSD, "Yield From Backing Collateral");
  dailySupplySideRevenue.addUSDValue(dailyFeesUSD * SUSDP_RATIO, "sUSDp Savings Holders");
  dailyRevenue.addUSDValue(dailyFeesUSD * DAO_RATIO, "DAO Treasury");
  if (licenseActive) dailyRevenue.addUSDValue(dailyFeesUSD * ANGLE_LABS_RATIO, "Angle Labs");
  dailyProtocolRevenue.addUSDValue(dailyFeesUSD * DAO_RATIO, "DAO Treasury");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Daily change in protocol net surplus (total collateral value minus USDp outstanding). Captures yield from yield-bearing collateral (sfrxUSD, sUSDe, ygamiUSDC, sUSDS) plus 0.05% burn fees on yield-bearing redemptions.",
  Revenue: "9% of net surplus accrual to the DAO Treasury, plus 1% to Angle Labs under BUSL 1.1 license (PIP-50) for periods before June 1, 2026.",
  ProtocolRevenue: "9% of net surplus accrual allocated to the DAO Treasury.",
  SupplySideRevenue: "90% of net surplus accrual distributed to sUSDp savings holders.",
};

const breakdownMethodology = {
  Fees: {
    "Yield From Backing Collateral": "Yield accrued on yield-bearing collateral (sfrxUSD, sUSDe, ygamiUSDC, sUSDS) held by the Parallelizer, plus 0.05% burn fees on yield-bearing redemptions.",
  },
  Revenue: {
    "DAO Treasury": "9% of net surplus accrual sent to the Parallel DAO Treasury.",
    "Angle Labs": "1% of net surplus accrual paid to Angle Labs under BUSL 1.1 license (PIP-50), applicable before June 1, 2026.",
  },
  ProtocolRevenue: {
    "DAO Treasury": "9% of net surplus accrual sent to the Parallel DAO Treasury.",
  },
  SupplySideRevenue: {
    "sUSDp Savings Holders": "90% of net surplus accrual distributed to sUSDp stakers as savings yield.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, cfg]) => [chain, { fetch, start: cfg.start }])
  ),
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;

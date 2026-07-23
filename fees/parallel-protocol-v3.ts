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
// Pre-expiry  (before June 1, 2026): 90% sUSDp holders, 9% DAO Treasury, 1% Angle Labs (BUSL 1.1 PIP-50)
// Post-expiry (after  June 1, 2026): 90% sUSDp holders, 10% DAO Treasury
const SUSDP_RATIO = 0.90;
const DAO_RATIO = 0.09;
const DAO_POST_EXPIRY_RATIO = 0.10;
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
  const daoRatio = licenseActive ? DAO_RATIO : DAO_POST_EXPIRY_RATIO;

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  dailyFees.addUSDValue(dailyFeesUSD, "Yield From Backing Collateral");
  dailySupplySideRevenue.addUSDValue(dailyFeesUSD * SUSDP_RATIO, "sUSDp Savings Holders");
  dailyRevenue.addUSDValue(dailyFeesUSD * daoRatio, "DAO Treasury");
  if (licenseActive) dailyRevenue.addUSDValue(dailyFeesUSD * ANGLE_LABS_RATIO, "Angle Labs");
  dailyProtocolRevenue.addUSDValue(dailyFeesUSD * daoRatio, "DAO Treasury");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Daily change in protocol net surplus (total collateral value minus USDp outstanding). Captures yield from yield-bearing collateral held by the Parallelizer plus burn fees on yield-bearing redemptions.",
  Revenue: "DAO Treasury share of net surplus accrual: 9% before June 1, 2026 (plus 1% to Angle Labs under BUSL 1.1 PIP-50), and 10% thereafter (Angle Labs 1% redistributed to DAO post license expiry).",
  ProtocolRevenue: "DAO Treasury share of net surplus accrual: 9% before June 1, 2026, 10% after (Angle Labs 1% redistributed to DAO post license expiry).",
  SupplySideRevenue: "90% of net surplus accrual distributed to sUSDp savings holders.",
};

const breakdownMethodology = {
  Fees: {
    "Yield From Backing Collateral": "Yield accrued on yield-bearing collateral held by the Parallelizer plus burn fees on yield-bearing redemptions.",
  },
  Revenue: {
    "DAO Treasury": "9% of net surplus accrual before June 1, 2026; 10% after (the 1% previously paid to Angle Labs is redistributed to the DAO Treasury post license expiry).",
    "Angle Labs": "1% of net surplus accrual paid to Angle Labs under BUSL 1.1 license (PIP-50), applicable only before June 1, 2026.",
  },
  ProtocolRevenue: {
    "DAO Treasury": "9% of net surplus accrual before June 1, 2026; 10% after (the 1% previously paid to Angle Labs is redistributed to the DAO Treasury post license expiry).",
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

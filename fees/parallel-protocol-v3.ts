import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

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
const ANGLE_LABS_LICENSE_EXPIRY = "2026-06-01";

const ABI = "function getCollateralRatio() view returns (uint64 collatRatio, uint256 stablecoinsIssued)";

// Mint, burn and redeem fees stay in the Parallelizer's reserves, so they are part of the surplus delta.
// They are computed per event as the contract applies them (facets/Swapper.sol, facets/Redeemer.sol):
// - mint: USDp minted x the asset's mint fee; burn: USDp burnt x the asset's burn fee. The rate is the first segment
//   of the asset's fee curve, flat inside its exposure band, read on-chain;
// - redeem: USDp redeemed x min(collateral ratio, 1) x (1 - the redemption curve's factor at that ratio).
const PARALLELIZER_ABI = {
  tokenP: "function tokenP() view returns (address)",
  mintFees: "function getCollateralMintFees(address collateral) view returns (uint64[] xFeeMint, int64[] yFeeMint)",
  burnFees: "function getCollateralBurnFees(address collateral) view returns (uint64[] xFeeBurn, int64[] yFeeBurn)",
  redemptionFees: "function getRedemptionFees() view returns (uint64[] xRedemptionCurve, int64[] yRedemptionCurve)",
};
const SWAP_EVENT = "event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed from, address to)";
const REDEEMED_EVENT = "event Redeemed(uint256 amount, address[] tokens, uint256[] amounts, address[] forfeitTokens, address indexed from, address indexed to)";
const BASE_9 = 1e9;

// LibHelpers.piecewiseLinear, for the increasing redemption curve
const piecewiseLinear = (x: number, xs: number[], ys: number[]) => {
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  if (x < xs[0]) return ys[0];
  let i = 0;
  while (xs[i + 1] <= x) i++;
  return ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / (xs[i + 1] - xs[i]);
};

const getMintRedeemFeesUSD = async (options: FetchOptions, parallelizer: string, collatRatio: number) => {
  const { fromApi, getLogs } = options;
  const [swaps, redemptions] = await Promise.all([
    getLogs({ target: parallelizer, eventAbi: SWAP_EVENT }),
    getLogs({ target: parallelizer, eventAbi: REDEEMED_EVENT }),
  ]);
  if (!swaps.length && !redemptions.length) return 0;

  const tokenP = (await fromApi.call({ abi: PARALLELIZER_ABI.tokenP, target: parallelizer })).toLowerCase();
  const legs = swaps.map((log: any) => log.tokenIn.toLowerCase() === tokenP
    ? { burn: true, collateral: log.tokenOut, usdp: log.amountIn }
    : { burn: false, collateral: log.tokenIn, usdp: log.amountOut });
  const mintCollaterals = [...new Set(legs.filter((l: any) => !l.burn).map((l: any) => l.collateral.toLowerCase()))] as string[];
  const burnCollaterals = [...new Set(legs.filter((l: any) => l.burn).map((l: any) => l.collateral.toLowerCase()))] as string[];
  const [mintCurves, burnCurves, redemptionCurve] = await Promise.all([
    mintCollaterals.length ? fromApi.multiCall({ abi: PARALLELIZER_ABI.mintFees, target: parallelizer, calls: mintCollaterals }) : [],
    burnCollaterals.length ? fromApi.multiCall({ abi: PARALLELIZER_ABI.burnFees, target: parallelizer, calls: burnCollaterals }) : [],
    redemptions.length ? fromApi.call({ abi: PARALLELIZER_ABI.redemptionFees, target: parallelizer }) : null,
  ]);
  const mintRate: Record<string, number> = {};
  const burnRate: Record<string, number> = {};
  mintCollaterals.forEach((c, i) => { mintRate[c] = Number((mintCurves[i].yFeeMint ?? mintCurves[i][1])[0]) / BASE_9; });
  burnCollaterals.forEach((c, i) => { burnRate[c] = Number((burnCurves[i].yFeeBurn ?? burnCurves[i][1])[0]) / BASE_9; });

  let feesUSD = 0;
  for (const leg of legs) {
    const rate = (leg.burn ? burnRate : mintRate)[leg.collateral.toLowerCase()];
    feesUSD += (Number(leg.usdp) / 1e18) * rate;
  }
  if (redemptionCurve) {
    const xs = (redemptionCurve.xRedemptionCurve ?? redemptionCurve[0]).map(Number);
    const ys = (redemptionCurve.yRedemptionCurve ?? redemptionCurve[1]).map(Number);
    const factor = collatRatio >= BASE_9 ? ys[ys.length - 1] : piecewiseLinear(collatRatio, xs, ys);
    for (const log of redemptions) {
      feesUSD += (Number(log.amount) / 1e18) * Math.min(collatRatio / BASE_9, 1) * (1 - factor / BASE_9);
    }
  }
  return feesUSD;
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, chain, fromApi, toApi } = options;
  const { parallelizer } = config[chain];

  const [[crStart, stablesStart], [crEnd, stablesEnd]] = await Promise.all([
    fromApi.call({ abi: ABI, target: parallelizer }),
    toApi.call({ abi: ABI, target: parallelizer }),
  ]);

  // Net surplus = (collatRatio / 1e9 - 1) * stablecoinsIssued — excess collateral above USDp backing (USDp = $1)
  // Daily fees = surplus delta: the mint, burn and redeem fees kept in the reserves, and the yield from yield-bearing collateral
  const surplusStart = (Number(crStart) / 1e9 - 1) * Number(stablesStart) / 1e18;
  const surplusEnd = (Number(crEnd) / 1e9 - 1) * Number(stablesEnd) / 1e18;
  const dailyFeesUSD = surplusEnd - surplusStart;
  const mintRedeemFeesUSD = await getMintRedeemFeesUSD(options, parallelizer, Number(crStart));
  const yieldUSD = dailyFeesUSD - mintRedeemFeesUSD;

  const licenseActive = options.dateString <= ANGLE_LABS_LICENSE_EXPIRY;
  const daoRatio = licenseActive ? DAO_RATIO : DAO_POST_EXPIRY_RATIO;

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  dailyFees.addUSDValue(yieldUSD, "Yield From Backing Collateral");
  dailySupplySideRevenue.addUSDValue(yieldUSD * SUSDP_RATIO, "Yield to sUSDp Savings Holders");
  dailyRevenue.addUSDValue(yieldUSD * daoRatio, "Yield to DAO Treasury");
  if (licenseActive) dailyRevenue.addUSDValue(yieldUSD * ANGLE_LABS_RATIO, "Yield to Angle Labs");
  dailyProtocolRevenue.addUSDValue(yieldUSD * daoRatio, "Yield to DAO Treasury");

  if (mintRedeemFeesUSD) {
    dailyFees.addUSDValue(mintRedeemFeesUSD, METRIC.MINT_REDEEM_FEES);
    dailySupplySideRevenue.addUSDValue(mintRedeemFeesUSD * SUSDP_RATIO, "Mint/Redeem Fees to sUSDp Savings Holders");
    dailyRevenue.addUSDValue(mintRedeemFeesUSD * daoRatio, "Mint/Redeem Fees to DAO Treasury");
    if (licenseActive) dailyRevenue.addUSDValue(mintRedeemFeesUSD * ANGLE_LABS_RATIO, "Mint/Redeem Fees to Angle Labs");
    dailyProtocolRevenue.addUSDValue(mintRedeemFeesUSD * daoRatio, "Mint/Redeem Fees to DAO Treasury");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "Daily change in protocol net surplus (total collateral value minus USDp outstanding), in two lines: the mint, burn and redeem fees paid that day, computed from the Parallelizer's Swap and Redeemed events at the rates the contract applies (read on-chain), and the yield from the yield-bearing collateral, which is the rest of the surplus change.",
  Revenue: "DAO Treasury share of net surplus accrual, on both lines: 9% before June 1, 2026 (plus 1% to Angle Labs under BUSL 1.1 PIP-50), and 10% thereafter (Angle Labs 1% redistributed to DAO post license expiry).",
  ProtocolRevenue: "DAO Treasury share of net surplus accrual, on both lines: 9% before June 1, 2026, 10% after (Angle Labs 1% redistributed to DAO post license expiry).",
  SupplySideRevenue: "90% of net surplus accrual distributed to sUSDp savings holders, on both lines.",
  HoldersRevenue: "None: the surplus share kept by the protocol goes to the DAO Treasury. The Treasury's PRL buybacks are not counted here. Those funded by the PRL holders' share of Parallel V2 fees under PGP-42 are counted at that fee source, in Parallel V2's holders revenue; the others are paid from the Treasury's holdings (the PGP-40 monthly allocation, the PGP-45 OTC buyback).",
};

const breakdownMethodology = {
  Fees: {
    "Yield From Backing Collateral": "Surplus change minus the mint, burn and redeem fees: yield accrued on the yield-bearing collateral held by the Parallelizer.",
    [METRIC.MINT_REDEEM_FEES]: "Fees kept in the Parallelizer's reserves on mints, burns and redemptions. Per Swap event, the USDp minted times the asset's mint fee, or the USDp burnt times its burn fee, at the asset's rate inside its exposure band (getCollateralMintFees, getCollateralBurnFees). Per Redeemed event, the USDp redeemed times min(collateral ratio, 1) times one minus the redemption curve factor (getRedemptionFees).",
  },
  Revenue: {
    "Yield to DAO Treasury": "9% of net surplus accrual before June 1, 2026; 10% after (the 1% previously paid to Angle Labs is redistributed to the DAO Treasury post license expiry).",
    "Yield to Angle Labs": "1% of net surplus accrual paid to Angle Labs under BUSL 1.1 license (PIP-50), applicable only before June 1, 2026.",
    "Mint/Redeem Fees to DAO Treasury": "9% of the mint, burn and redeem fees before June 1, 2026; 10% after.",
    "Mint/Redeem Fees to Angle Labs": "1% of the mint, burn and redeem fees paid to Angle Labs under BUSL 1.1 license (PIP-50), applicable only before June 1, 2026.",
  },
  ProtocolRevenue: {
    "Yield to DAO Treasury": "9% of net surplus accrual before June 1, 2026; 10% after (the 1% previously paid to Angle Labs is redistributed to the DAO Treasury post license expiry).",
    "Mint/Redeem Fees to DAO Treasury": "9% of the mint, burn and redeem fees before June 1, 2026; 10% after.",
  },
  SupplySideRevenue: {
    "Yield to sUSDp Savings Holders": "90% of net surplus accrual distributed to sUSDp stakers as savings yield.",
    "Mint/Redeem Fees to sUSDp Savings Holders": "90% of the mint, burn and redeem fees, distributed to sUSDp stakers as savings yield.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter:config,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { CREATOR_SHARE_PERCENT, LAUNCH_START, USDC, graduatedPositionClaims, launchCurveSwaps } from "../helpers/ryntra";

// Ryntra Launch (https://ryntra.io): a launchpad on Meteora's Dynamic Bonding Curve. Its pools are created on
// two configs of its own and paid for by a wallet used for nothing else; the configs' trading fee is split between
// the token's creator (40%) and Ryntra as the partner (60%). Addresses: helpers/ryntra.ts.

const LABELS = {
  CURVE_FEES: "Bonding Curve Trading Fees",
  CURVE_TO_RYNTRA: "Bonding Curve Trading Fees To Ryntra",
  CURVE_TO_CREATORS: "Bonding Curve Trading Fees To Creators",
  POOL_FEES: "Graduated Pool Fees",
  POOL_TO_RYNTRA: "Graduated Pool Fees To Ryntra",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const swap of await launchCurveSwaps(options.startTimestamp, options.endTimestamp)) {
    // The program splits the trading fee the same way: the creator's part rounds down, the partner keeps the rest.
    const creator = (swap.tradingFee * CREATOR_SHARE_PERCENT) / 100n;
    // Collected in USDC, the configs' quote (collect_fee_mode 0).
    dailyFees.add(USDC, swap.tradingFee, LABELS.CURVE_FEES);
    dailyRevenue.add(USDC, swap.tradingFee - creator, LABELS.CURVE_TO_RYNTRA);
    dailySupplySideRevenue.add(USDC, creator, LABELS.CURVE_TO_CREATORS);
  }
  for (const claim of await graduatedPositionClaims(options.startTimestamp, options.endTimestamp)) {
    dailyFees.add(claim.mint, claim.amount, LABELS.POOL_FEES);
    dailyRevenue.add(claim.mint, claim.amount, LABELS.POOL_TO_RYNTRA);
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Trading fees on the bonding curves of tokens launched with Ryntra Launch (Meteora DBC pools on Ryntra Launch's configs, created by its pool payer), from every swap event; after a curve graduates to Meteora DAMM v2, the fees of the liquidity locked for Ryntra, when Ryntra claims them. Meteora's own protocol fee is not included.",
  UserFees: "Equal to fees: every fee is paid by the trader.",
  Revenue: "Ryntra's 60% of the bonding curve trading fee as the configs' partner, and the claimed fees of its locked liquidity after graduation.",
  ProtocolRevenue: "Equal to revenue: there is no token and nothing is distributed to holders.",
  SupplySideRevenue: "The token creator's 40% of the bonding curve trading fee.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CURVE_FEES]: "The configs' trading fee on every swap on the bonding curve of a token launched with Ryntra.",
    [LABELS.POOL_FEES]: "Fees of the DAMM v2 liquidity locked for Ryntra after a launch graduates, when claimed.",
  },
  Revenue: {
    [LABELS.CURVE_TO_RYNTRA]: "Ryntra's 60% of the bonding curve trading fee.",
    [LABELS.POOL_TO_RYNTRA]: "Claimed fees of the liquidity locked for Ryntra after graduation.",
  },
  ProtocolRevenue: {
    [LABELS.CURVE_TO_RYNTRA]: "Ryntra's 60% of the bonding curve trading fee.",
    [LABELS.POOL_TO_RYNTRA]: "Claimed fees of the liquidity locked for Ryntra after graduation.",
  },
  SupplySideRevenue: {
    [LABELS.CURVE_TO_CREATORS]: "The token creator's 40% of the bonding curve trading fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // A handful of pools, read straight from the chain each hour.
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: new Date(LAUNCH_START * 1000).toISOString().slice(0, 10),
  methodology,
  breakdownMethodology,
};

export default adapter;

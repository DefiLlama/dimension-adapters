import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { CREATOR_SHARE_PERCENT, LAUNCH_START, USDC, launchCurveSwaps, launchReferralSwaps, partnerIncome } from "../helpers/ryntra";

// Ryntra Launch (https://ryntra.io): a launchpad on Meteora's Dynamic Bonding Curve. Its pools are created on two
// configs of its own and paid for by a wallet used for nothing else. Addresses and rates: helpers/ryntra.ts.

const LABELS = {
  CURVE_FEES: "Bonding Curve Trading Fees",
  REFERRAL_FEES: "Referral Fees",
  GRADUATION_FEES: "Graduation Fees",
  POOL_FEES: "Graduated Pool Fees",
  CURVE_TO_RYNTRA: "Bonding Curve Trading Fees To Ryntra",
  CURVE_TO_CREATORS: "Bonding Curve Trading Fees To Creators",
  REFERRAL_TO_RYNTRA: "Referral Fees To Ryntra",
  GRADUATION_TO_RYNTRA: "Graduation Fees To Ryntra",
  POOL_TO_RYNTRA: "Graduated Pool Fees To Ryntra",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { startTimestamp: from, endTimestamp: to } = options;

  for (const swap of await launchCurveSwaps(from, to)) {
    // The program splits the configs' trading fee the same way: the creator's part rounds down, the partner keeps
    // the rest. Collected in USDC, the configs' quote (collect_fee_mode 0).
    const creator = (swap.tradingFee * CREATOR_SHARE_PERCENT) / 100n;
    dailyFees.add(USDC, swap.tradingFee, LABELS.CURVE_FEES);
    dailyRevenue.add(USDC, swap.tradingFee - creator, LABELS.CURVE_TO_RYNTRA);
    dailySupplySideRevenue.add(USDC, creator, LABELS.CURVE_TO_CREATORS);
  }
  // Meteora pays the referral fee out of its own protocol fee, which is not counted here.
  for (const swap of await launchReferralSwaps(from, to)) {
    dailyFees.add(USDC, swap.referralFee, LABELS.REFERRAL_FEES);
    dailyRevenue.add(USDC, swap.referralFee, LABELS.REFERRAL_TO_RYNTRA);
  }
  for (const income of await partnerIncome(from, to)) {
    const [fees, revenue] = income.kind === "position-fees" ? [LABELS.POOL_FEES, LABELS.POOL_TO_RYNTRA] : [LABELS.GRADUATION_FEES, LABELS.GRADUATION_TO_RYNTRA];
    dailyFees.add(income.mint, income.amount, fees);
    dailyRevenue.add(income.mint, income.amount, revenue);
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "On the bonding curves of tokens launched with Ryntra Launch (Meteora DBC pools on its configs, created by its pool payer): the configs' trading fee on every swap, from the swap events; the referral fee Meteora pays Ryntra on trades made through Ryntra, on the curve and in the pool after graduation; and what Ryntra takes as the partner when a curve graduates — its share of the migration fee, the surplus above the threshold, and later the fees of the DAMM v2 liquidity locked for it — when its fee claimer withdraws them. Meteora's protocol fee and the creator's share of the migration fee are not included.",
  UserFees: "Equal to fees: every fee is paid by the trader.",
  Revenue: "Ryntra's 60% of the bonding curve trading fee as the configs' partner, the referral fees, and its graduation income when withdrawn.",
  ProtocolRevenue: "Equal to revenue: there is no token and nothing is distributed to holders.",
  SupplySideRevenue: "The token creator's 40% of the bonding curve trading fee.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CURVE_FEES]: "The configs' trading fee (0.8% of a trade: the 1% curve fee less Meteora's 20%) on every swap on the bonding curve of a token launched with Ryntra.",
    [LABELS.REFERRAL_FEES]: "The referral fee Meteora pays Ryntra, out of its protocol fee, on trades made through Ryntra of tokens launched with it, as the swap event states it.",
    [LABELS.GRADUATION_FEES]: "Ryntra's 60% of a graduating curve's 2% migration fee, and the quote above the graduation threshold, when withdrawn by its fee claimer.",
    [LABELS.POOL_FEES]: "Fees of the DAMM v2 liquidity locked for Ryntra after a launch graduates, when claimed, in USDC and in the launched token.",
  },
  Revenue: {
    [LABELS.CURVE_TO_RYNTRA]: "Ryntra's 60% of the bonding curve trading fee.",
    [LABELS.REFERRAL_TO_RYNTRA]: "The whole Meteora referral fee.",
    [LABELS.GRADUATION_TO_RYNTRA]: "Ryntra's graduation income, when withdrawn.",
    [LABELS.POOL_TO_RYNTRA]: "Claimed fees of the liquidity locked for Ryntra after graduation.",
  },
  ProtocolRevenue: {
    [LABELS.CURVE_TO_RYNTRA]: "Ryntra's 60% of the bonding curve trading fee.",
    [LABELS.REFERRAL_TO_RYNTRA]: "The whole Meteora referral fee.",
    [LABELS.GRADUATION_TO_RYNTRA]: "Ryntra's graduation income, when withdrawn.",
    [LABELS.POOL_TO_RYNTRA]: "Claimed fees of the liquidity locked for Ryntra after graduation.",
  },
  SupplySideRevenue: {
    [LABELS.CURVE_TO_CREATORS]: "The token creator's 40% of the bonding curve trading fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // A handful of pools and accounts, read straight from the chain each hour.
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: new Date(LAUNCH_START * 1000).toISOString().slice(0, 10),
  methodology,
  breakdownMethodology,
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { JUPITER_SHARE_OF_REFERRAL_FEES, TRADING_START, ryntraTrades } from "../helpers/ryntra";

// Ryntra (https://ryntra.io) is a trading app: people swap and trade spot, memes and tokenized stocks through
// it, and it charges its own fee inside the trade's transaction. Its addresses and the rule it counts by are in
// helpers/ryntra.ts; https://ryntra.io/stats shows the same figures.

const LABELS = {
  LAUNCH_REFERRAL_FEES: "Launched Token Referral Fees",
  TO_RYNTRA: "Trading Fees To Ryntra",
  LAUNCH_REFERRAL_TO_RYNTRA: "Launched Token Referral Fees To Ryntra",
  TO_JUPITER: "Trading Fees To Jupiter",
};

// Jupiter's share of what reached the referral account, rounded up as the referral program rounds it.
const jupiterPart = (amount: bigint) => (amount * BigInt(JUPITER_SHARE_OF_REFERRAL_FEES * 10_000) + 9_999n) / 10_000n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const { trade } of await ryntraTrades(options.startTimestamp, options.endTimestamp)) {
    for (const credit of trade.credits) {
      if (credit.identity === "launch-referral") {
        dailyFees.add(credit.mint, credit.amount, LABELS.LAUNCH_REFERRAL_FEES);
        dailyRevenue.add(credit.mint, credit.amount, LABELS.LAUNCH_REFERRAL_TO_RYNTRA);
        continue;
      }
      dailyFees.add(credit.mint, credit.amount, METRIC.TRADING_FEES);
      const jupiter = credit.identity === "jupiter-referral" ? jupiterPart(credit.amount) : 0n;
      dailyRevenue.add(credit.mint, credit.amount - jupiter, LABELS.TO_RYNTRA);
      if (jupiter > 0n) dailySupplySideRevenue.add(credit.mint, jupiter, LABELS.TO_JUPITER);
    }
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Fees people pay Ryntra on trades made through it, counted in the trade's own transaction: what reached Ryntra's fee wallet and the token accounts of its Jupiter referral account, in a transaction where the signer traded (a plain transfer into them is not a fee), and the referral fee Meteora pays Ryntra on trades of tokens launched with Ryntra.",
  UserFees: "Equal to fees: every fee is paid by the trader.",
  Revenue: "Fees less Jupiter's 20% share of what reached the referral account. Cashback to traders is paid later, when they claim it, and is not deducted.",
  ProtocolRevenue: "Equal to revenue: there is no token and nothing is distributed to holders.",
  SupplySideRevenue: "Jupiter's 20% share of the fees that reached Ryntra's Jupiter referral account.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Ryntra's fee on swaps and spot trades, paid into its fee wallet or its Jupiter referral account inside the trade.",
    [LABELS.LAUNCH_REFERRAL_FEES]: "The referral fee Meteora pays Ryntra, out of its own protocol fee, on trades made through Ryntra of tokens launched with Ryntra, as the swap event states it.",
  },
  Revenue: {
    [LABELS.TO_RYNTRA]: "The whole fee paid into the fee wallet, and 80% of what reached the Jupiter referral account.",
    [LABELS.LAUNCH_REFERRAL_TO_RYNTRA]: "The whole Meteora referral fee on trades of tokens launched with Ryntra.",
  },
  ProtocolRevenue: {
    [LABELS.TO_RYNTRA]: "The whole fee paid into the fee wallet, and 80% of what reached the Jupiter referral account.",
    [LABELS.LAUNCH_REFERRAL_TO_RYNTRA]: "The whole Meteora referral fee on trades of tokens launched with Ryntra.",
  },
  SupplySideRevenue: {
    [LABELS.TO_JUPITER]: "Jupiter's 20% share of the fees that reached Ryntra's Jupiter referral account.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // Ryntra's fee accounts see a few dozen transactions a day, so each hour is read straight from the chain.
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: new Date(TRADING_START * 1000).toISOString().slice(0, 10),
  methodology,
  breakdownMethodology,
};

export default adapter;

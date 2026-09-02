import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { getSolanaReceived } from "../helpers/token";

// The legacy collector was swept into the current collector on 2025-07-05:
// https://solscan.io/tx/2doyJpiA2V7V4tSMaqfbtSTieR8HsFieWuPHc8MZUCT7aZSUT3Fo8VoV1pKHJHxiteRoTG1ZS9QEPnqfUZDHTjce
// Excluding transfers and signatures from both collectors prevents that treasury
// migration (and any later internal movements) from being counted as user fees.
// Current dedicated fee collector: https://orbmarkets.io/address/rapidXMVLw5uBieKHDGvF9k4xSSDXyD2FC5wLTAajaJ/transfers
const CURRENT_FEE_COLLECTOR = "rapidXMVLw5uBieKHDGvF9k4xSSDXyD2FC5wLTAajaJ";
// Legacy dedicated fee collector: https://orbmarkets.io/address/feesEi65EDHZ7jVMPUicJtnCyTnsoqnQB93GHqLZ6BC/history
const LEGACY_FEE_COLLECTOR = "feesEi65EDHZ7jVMPUicJtnCyTnsoqnQB93GHqLZ6BC";
const FEE_COLLECTORS = [CURRENT_FEE_COLLECTOR, LEGACY_FEE_COLLECTOR];
// The current collector distributes 14% of each sweep to these referral wallets.
// Representative distribution: https://solscan.io/tx/4HkyycaGr5kh1LArpyisEHJFsHLr4sMDcBjgAd7rCBLsJgb7v9J3ThrZD4JYcorkWtEmEWaKJJy2NG6of2ECvV4H
const REFERRAL_RECIPIENTS = [
  "3os7e5tBFKXFhKZ8igzpCpZr8cw5DvwHrc5bZwELjiLL", // 6.2%
  "AaNQ9Bf2knDsxPSCjwLDRpCi6Ejgov9CGUNVdF5LyFUB", // 5.2%
  "A8pkLHANwLsHoRLe2zKGVnehNsUQXM9S1FortS1hRuHi", // 1.6%
  "H9zga9rFmAoZ3VQHhXYe3VTJiGvhc3cqVjCHrXM8kvti", // 1.0%
];
const COLLECTOR_FEES = "Rapid Launch Collector Fees";
const COLLECTOR_FEES_TO_TREASURY = "Rapid Launch Collector Fees To Treasury";
const REFERRAL_FEES_TO_REFERRERS = "Rapid Launch Referral Fees To Referrers";

/** Fetches external SOL receipts sent to Rapid Launch's dedicated fee collectors. */
const fetch = async (options: FetchOptions) => {
  // Rapid Launch builds transactions against third-party launchpad programs and
  // historically also collected fees in standalone System Program transfers.
  // The dedicated collector is therefore the stable attribution signal; filtering
  // by one launchpad program would omit both integrations and most legacy fees.
  const [received, referralDistributions] = await Promise.all([
    getSolanaReceived({
      options,
      targets: FEE_COLLECTORS,
      mints: [ADDRESSES.solana.SOL],
      blacklists: FEE_COLLECTORS,
      blacklist_signers: FEE_COLLECTORS,
    }),
    getSolanaReceived({
      options,
      targets: REFERRAL_RECIPIENTS,
      mints: [ADDRESSES.solana.SOL],
      fromAddresses: FEE_COLLECTORS,
    }),
  ]);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, COLLECTOR_FEES);
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(
    referralDistributions,
    REFERRAL_FEES_TO_REFERRERS,
  );
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(received, COLLECTOR_FEES_TO_TREASURY);
  dailyRevenue.subtract(referralDistributions, COLLECTOR_FEES_TO_TREASURY);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-04-01",
  methodology: {
    Fees: "SOL fees paid by users for Rapid Launch token deployment and trading tools.",
    Revenue:
      "Fees collected by Rapid Launch after referral distributions are paid to referrers.",
    ProtocolRevenue: "Same as Revenue.",
    SupplySideRevenue:
      "SOL distributed from Rapid Launch's fee collectors to referral recipients.",
  },
  breakdownMethodology: {
    Fees: {
      [COLLECTOR_FEES]:
        "SOL received by the current and legacy Rapid Launch fee collectors from external addresses.",
    },
    Revenue: {
      [COLLECTOR_FEES_TO_TREASURY]:
        "SOL receipts retained by Rapid Launch after excluding collector-to-collector transfers.",
    },
    ProtocolRevenue: {
      [COLLECTOR_FEES_TO_TREASURY]:
        "SOL receipts retained by Rapid Launch as protocol revenue.",
    },
    SupplySideRevenue: {
      [REFERRAL_FEES_TO_REFERRERS]:
        "SOL distributed by Rapid Launch's fee collectors to referral recipients.",
    },
  },
};

export default adapter;

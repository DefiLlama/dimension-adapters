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
const COLLECTOR_FEES = "Rapid Launch Collector Fees";
const COLLECTOR_FEES_TO_TREASURY = "Rapid Launch Collector Fees To Treasury";

/** Fetches external SOL receipts sent to Rapid Launch's dedicated fee collectors. */
const fetch = async (options: FetchOptions) => {
  // Rapid Launch builds transactions against third-party launchpad programs and
  // historically also collected fees in standalone System Program transfers.
  // The dedicated collector is therefore the stable attribution signal; filtering
  // by one launchpad program would omit both integrations and most legacy fees.
  const received = await getSolanaReceived({
    options,
    targets: FEE_COLLECTORS,
    mints: [ADDRESSES.solana.SOL],
    blacklists: FEE_COLLECTORS,
    blacklist_signers: FEE_COLLECTORS,
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, COLLECTOR_FEES);
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(received, COLLECTOR_FEES_TO_TREASURY);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
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
      "Fees collected by Rapid Launch, excluding transfers between its fee collectors.",
    ProtocolRevenue: "Same as Revenue.",
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
  },
};

export default adapter;

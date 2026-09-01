import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";
import { getSolanaReceived } from "../helpers/token";

// The legacy collector was swept into the current collector on 2025-07-05.
// Excluding transfers and signatures from both collectors prevents that treasury
// migration (and any later internal movements) from being counted as user fees.
const FEE_COLLECTORS = [
  "feesEi65EDHZ7jVMPUicJtnCyTnsoqnQB93GHqLZ6BC",
  "rapidXMVLw5uBieKHDGvF9k4xSSDXyD2FC5wLTAajaJ",
];

async function fetch(options: FetchOptions) {
  const received = await getSolanaReceived({
    options,
    targets: FEE_COLLECTORS,
    mints: [ADDRESSES.solana.SOL],
    blacklists: FEE_COLLECTORS,
    blacklist_signers: FEE_COLLECTORS,
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, METRIC.PROTOCOL_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-04-01",
    },
  },
  methodology: {
    Fees: "SOL fees paid by users for Rapid Launch token deployment and trading tools.",
    UserFees:
      "SOL fees paid by users for Rapid Launch token deployment and trading tools.",
    Revenue:
      "Fees collected by Rapid Launch, excluding transfers between its fee collectors.",
    ProtocolRevenue: "Same as Revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]:
        "SOL received by the current and legacy Rapid Launch fee collectors from external addresses.",
    },
  },
};

export default adapter;

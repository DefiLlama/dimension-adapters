// DexLaunch — DefiLlama FEES adapter (drop into dimension-adapters/fees/dexlaunch.ts).
//
// Every ETH revenue stream converges on the PlatformFeeCollector (presale 2% service fee,
// launch tokens' master fee, the pad's 0.5% per-trade skim, the locker's fee-claim cut), and
// the collector EMITS on both legs, so the daily figures come straight from its logs:
//   dailyFees            = Σ FeesReceived.amount        (all value collected, ETH)
//   dailyHoldersRevenue  = Σ FeesDistributed.holdersAmount (governance-holder half of the splits)
//   dailyProtocolRevenue = Σ FeesDistributed.ownerAmount   (owner/treasury half)
//   dailyRevenue         = dailyFees                    (no supply-side cut)
// Logs, not lifetime-counter deltas, because Robinhood Chain's public RPC serves no archive
// state — a historical eth_call at the period-start block fails ("metadata is not found").
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// deployments/<chainId>.json → the PlatformFeeCollector proxy (UUPS — the address is stable
// across upgrades, only the impl behind it rotates).
const COLLECTORS: Partial<Record<CHAIN, string>> = {
  [CHAIN.ROBINHOOD]: "0x949a6e0530119d7cDBE5e904e47056b39BE1f156",
};

const FEES_RECEIVED = "event FeesReceived(address indexed from, uint256 amount)";
const FEES_DISTRIBUTED = "event FeesDistributed(uint256 holdersAmount, uint256 ownerAmount)";

async function fetch(options: FetchOptions) {
  const collector = COLLECTORS[options.chain as CHAIN]!;
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const [received, distributed] = await Promise.all([
    options.getLogs({ target: collector, eventAbi: FEES_RECEIVED }),
    options.getLogs({ target: collector, eventAbi: FEES_DISTRIBUTED }),
  ]);
  for (const log of received) dailyFees.add(ADDRESSES.null, log.amount);
  for (const log of distributed) {
    dailyHoldersRevenue.add(ADDRESSES.null, log.holdersAmount);
    dailyProtocolRevenue.add(ADDRESSES.null, log.ownerAmount);
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue, dailyProtocolRevenue };
}

const methodology = {
  Fees: "All protocol ETH revenue arriving at the PlatformFeeCollector: the 2% presale service fee, launch tokens' master fee, the bonding pad's 0.5% per-trade skim, and the locker's fee-claim cut (FeesReceived logs).",
  Revenue: "Identical to Fees — there is no supply-side cut.",
  HoldersRevenue: "The half of every distribution delivered to GovernanceToken holders as native-ETH dividends (FeesDistributed logs).",
  ProtocolRevenue: "The half of every distribution delivered to the protocol owner (FeesDistributed logs).",
};

export default {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-08-01", // genesis deploy on Robinhood Chain (2026-08-01T16:24:06Z)
    },
  },
  methodology,
} as Adapter;

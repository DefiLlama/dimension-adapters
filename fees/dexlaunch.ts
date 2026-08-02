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

// The PlatformFeeCollector proxy on Robinhood Chain (UUPS — the address is stable across
// upgrades, only the impl behind it rotates). Listed in the protocol's address registry
// (https://dexlaunch.fun/docs, "Deployed contracts"):
// https://robinhoodchain.blockscout.com/address/0x949a6e0530119d7cDBE5e904e47056b39BE1f156
const COLLECTOR = "0x949a6e0530119d7cDBE5e904e47056b39BE1f156";

const FEES_RECEIVED = "event FeesReceived(address indexed from, uint256 amount)";
const FEES_DISTRIBUTED = "event FeesDistributed(uint256 holdersAmount, uint256 ownerAmount)";

// One label per stream. FeesReceived carries no per-source discriminator worth decoding (the
// sender set is open-ended: sales, pads, tokens, locker), so collected fees are one bucket.
const PLATFORM_FEES = "Platform Fees";
const PLATFORM_REVENUE = "Platform Fees Retained By The Protocol";
const FEES_TO_HOLDERS = "Fees To Governance Holders";
const FEES_TO_TREASURY = "Fees To Treasury";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const [received, distributed] = await Promise.all([
    options.getLogs({ target: COLLECTOR, eventAbi: FEES_RECEIVED }),
    options.getLogs({ target: COLLECTOR, eventAbi: FEES_DISTRIBUTED }),
  ]);
  for (const log of received) {
    dailyFees.add(ADDRESSES.null, log.amount, PLATFORM_FEES);
    // Same amounts, its own balance + label: Revenue is the destination-side view (everything is
    // retained — split later between governance holders and the treasury), Fees the source side.
    dailyRevenue.add(ADDRESSES.null, log.amount, PLATFORM_REVENUE);
  }
  for (const log of distributed) {
    dailyHoldersRevenue.add(ADDRESSES.null, log.holdersAmount, FEES_TO_HOLDERS);
    dailyProtocolRevenue.add(ADDRESSES.null, log.ownerAmount, FEES_TO_TREASURY);
  }

  return { dailyFees, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue };
}

const methodology = {
  Fees: "All protocol ETH revenue arriving at the PlatformFeeCollector: the 2% presale service fee, launch tokens' master fee, the bonding pad's 0.5% per-trade skim, and the locker's fee-claim cut (FeesReceived logs).",
  Revenue: "Identical to Fees — there is no supply-side cut.",
  HoldersRevenue: "The half of every distribution delivered to GovernanceToken holders as native-ETH dividends (FeesDistributed logs).",
  ProtocolRevenue: "The half of every distribution delivered to the protocol owner (FeesDistributed logs).",
};

const breakdownMethodology = {
  Fees: {
    [PLATFORM_FEES]:
      "ETH received by the PlatformFeeCollector from every protocol stream: the 2% presale service fee, launch tokens' master fee, the bonding pad's 0.5% per-trade skim, and the locker's fee-claim cut (FeesReceived logs).",
  },
  Revenue: {
    [PLATFORM_REVENUE]:
      "Every collected fee is retained by the protocol (no supply-side cut) and later split between governance holders and the treasury — see HoldersRevenue / ProtocolRevenue for the split.",
  },
  HoldersRevenue: {
    [FEES_TO_HOLDERS]:
      "The half of every distribution paid to GovernanceToken holders as native-ETH dividends (holdersAmount of FeesDistributed).",
  },
  ProtocolRevenue: {
    [FEES_TO_TREASURY]:
      "The half of every distribution paid to the protocol owner (ownerAmount of FeesDistributed).",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true, // pure EVM-log adapter, safe to run hourly
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-08-01", // genesis deploy on Robinhood Chain (2026-08-01T16:24:06Z)
};

export default adapter;

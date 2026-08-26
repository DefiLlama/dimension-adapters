// DexLaunch — DefiLlama FEES adapter (drop into dimension-adapters/fees/dexlaunch.ts).
//
// Every native revenue stream converges on one collector per chain (presale 2% service fee,
// launch tokens' master fee, the pad's 0.5% per-trade skim, the instant-launch fee, the locker's
// fee-claim cut), and the collector EMITS on receipt, so the daily figures come straight from
// its logs:
//   dailyFees            = Σ FeesReceived.amount        (all value collected, native)
//   dailyHoldersRevenue  = Σ FeesDistributed.holdersAmount (governance-holder half of the splits)
//   dailyProtocolRevenue = Σ FeesDistributed.ownerAmount   (owner/treasury half)
//   dailyRevenue         = dailyFees                    (no supply-side cut)
// Logs, not lifetime-counter deltas, because Robinhood Chain's public RPC serves no archive
// state — a historical eth_call at the period-start block fails ("metadata is not found").
//
// CHAINS. Robinhood Chain is the home chain (PlatformFeeCollector, which also splits to
// governance holders / treasury). HyperEVM is a satellite: its BridgingFeeCollector emits the
// same FeesReceived on every HYPE fee, then converts and bridges the pot home via Across, where
// it re-enters the home collector THROUGH the UsdgConverter. Those repatriation arrivals are
// EXCLUDED from Robinhood's dailyFees (FeesReceived.from == UsdgConverter) so revenue counts
// once, on the chain that earned it. Distributions stay home-chain only (satellites never
// split), so on days a bridged pot distributes, holders+protocol revenue can exceed that day's
// Robinhood-earned fees — attribution by origin, distribution by home, both correct.
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const FEES_RECEIVED = "event FeesReceived(address indexed from, uint256 amount)";
const FEES_DISTRIBUTED = "event FeesDistributed(uint256 holdersAmount, uint256 ownerAmount)";

// Per-chain fee sink, from the protocol's address registry (https://dexlaunch.fun/docs,
// "Deployed contracts"). Both are UUPS proxies — stable addresses, only impls rotate.
// One per-chain object, passed straight through as `adapter` (repo convention — the module
// builder keeps only the whitelisted keys like `start`; fetch reads the rest at call time).
const chainConfig: Record<string, { collector: string; excludeFrom?: string; hasDistributions: boolean; start: string }> = {
  [CHAIN.ROBINHOOD]: {
    // https://robinhoodchain.blockscout.com/address/0x949a6e0530119d7cDBE5e904e47056b39BE1f156
    collector: "0x949a6e0530119d7cDBE5e904e47056b39BE1f156",
    // The UsdgConverter delivers satellite revenue bridged home via Across; those FeesReceived
    // logs are the SAME fees already counted on the satellite at collection time.
    excludeFrom: "0xA1b8FfbbE071A8B77a6624C8C25F9F7090bbf0b4",
    hasDistributions: true,
    start: "2026-08-01", // genesis deploy on Robinhood Chain (2026-08-01T16:24:06Z)
  },
  [CHAIN.HYPERLIQUID]: {
    // BridgingFeeCollector — SaleFactory(0x7d80788C...a545).masterFeeCollector()
    collector: "0x53E5d2535547598CaB583f71f0B1a18dB1828859",
    hasDistributions: false,
    start: "2026-08-25", // satellite genesis on HyperEVM
  },
};

// One label per stream. FeesReceived carries no per-source discriminator worth decoding (the
// sender set is open-ended: sales, pads, tokens, locker), so collected fees are one bucket.
const PLATFORM_FEES = "Platform Fees";
const PLATFORM_REVENUE = "Platform Fees Retained By The Protocol";
const FEES_TO_HOLDERS = "Fees To Governance Holders";
const FEES_TO_TREASURY = "Fees To Treasury";

async function fetch(options: FetchOptions) {
  const { collector, excludeFrom, hasDistributions } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const [received, distributed] = await Promise.all([
    options.getLogs({ target: collector, eventAbi: FEES_RECEIVED }),
    hasDistributions
      ? options.getLogs({ target: collector, eventAbi: FEES_DISTRIBUTED })
      : Promise.resolve([]),
  ]);
  for (const log of received) {
    // Skip satellite revenue re-arriving through the bridge — counted at origin already.
    if (excludeFrom && String(log.from).toLowerCase() === excludeFrom.toLowerCase()) continue;
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
  Fees: "All protocol native revenue arriving at the chain's fee collector: the 2% presale service fee, launch tokens' master fee, the bonding pad's 0.5% per-trade skim, the instant-launch fee, and the locker's fee-claim cut (FeesReceived logs). Satellite revenue bridged home is excluded on arrival — it is counted on the chain that earned it.",
  Revenue: "All protocol native revenue arriving at the chain's fee collector (see Fees); the protocol retains everything, with the home-chain split between governance holders and the treasury reported under HoldersRevenue / ProtocolRevenue.",
  HoldersRevenue: "The share of every home-chain distribution delivered to GovernanceToken holders as native-ETH dividends (FeesDistributed logs; distributions happen only on Robinhood Chain).",
  ProtocolRevenue: "The share of every home-chain distribution delivered to the protocol owner (FeesDistributed logs; distributions happen only on Robinhood Chain).",
};

const breakdownMethodology = {
  Fees: {
    [PLATFORM_FEES]:
      "Native revenue received by the chain's fee collector from every protocol stream: the 2% presale service fee, launch tokens' master fee, the bonding pad's 0.5% per-trade skim, the instant-launch fee, and the locker's fee-claim cut (FeesReceived logs; bridge repatriations excluded).",
  },
  Revenue: {
    [PLATFORM_REVENUE]:
      "Every collected fee is retained by the protocol (no supply-side cut) and later split between governance holders and the treasury on the home chain — see HoldersRevenue / ProtocolRevenue for the split.",
  },
  HoldersRevenue: {
    [FEES_TO_HOLDERS]:
      "The share of every distribution paid to GovernanceToken holders as native-ETH dividends (holdersAmount of FeesDistributed).",
  },
  ProtocolRevenue: {
    [FEES_TO_TREASURY]:
      "The share of every distribution paid to the protocol owner (ownerAmount of FeesDistributed).",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  adapter: chainConfig,
};

export default adapter;

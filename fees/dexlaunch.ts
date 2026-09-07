// DexLaunch — DefiLlama FEES adapter (drop into dimension-adapters/fees/dexlaunch.ts).
//
// Every native revenue stream converges on one collector per chain (presale 2% service fee,
// launch tokens' master fee, the pad's 0.5% per-trade skim, the instant-launch fee, the locker's
// fee-claim cut), and the collector EMITS on receipt, so the daily figures come straight from
// its logs:
//   dailyFees            = Σ FeesReceived.amount + Σ ReferralPaid.cut  (gross, what users paid)
//   dailyRevenue         = Σ FeesReceived.amount                       (net of the referrer share)
//   dailySupplySideRevenue = Σ ReferralPaid.cut   (the cost of funds against those fees)
//   dailyHoldersRevenue  = Σ FeesDistributed.holdersAmount (governance-holder share of the splits)
//   dailyProtocolRevenue = Σ FeesDistributed.ownerAmount    (owner/treasury share)
// Logs, not lifetime-counter deltas, because Robinhood Chain's public RPC serves no archive
// state — a historical eth_call at the period-start block fails ("metadata is not found").
//
// REFERRALS. The user-attributed streams (pad trade skim, presale service fee, instant-launch
// fee) take one hop through a ReferralRegistry, which pays the trader's referrer a 10% cut and
// forwards the remainder to the collector. That cut is a fee the user paid but NOT revenue the
// protocol kept, so it is the supply side: Fees and SupplySideRevenue, never Revenue, which
// keeps dailyFees = dailyRevenue + dailySupplySideRevenue.
//
// CHAINS. Robinhood Chain is the home chain (PlatformFeeCollector, which also splits to
// governance holders / treasury). Satellite chains keep a bridging collector that earns fees
// locally, converts the pot and bridges it home, where it re-enters the home collector through
// the UsdgConverter. Satellite revenue is counted at ORIGIN, so those arrivals are excluded from
// Robinhood's fees (FeesReceived.from == UsdgConverter) and revenue counts exactly once.
// Distributions stay home-chain only (satellites never split), so on days a bridged pot
// distributes, holders+protocol revenue can exceed that day's Robinhood-earned fees —
// attribution by origin, distribution by home, both correct.
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const FEES_RECEIVED = "event FeesReceived(address indexed from, uint256 amount)";
const FEES_DISTRIBUTED = "event FeesDistributed(uint256 holdersAmount, uint256 ownerAmount)";
const REFERRAL_PAID =
  "event ReferralPaid(address indexed referrer, address indexed user, address indexed asset, uint256 cut, uint256 fee)";

type ChainCfg = {
  collector: string;
  registry: string;
  hasDistributions: boolean;
  /** Home chain only: the Across fill handler that re-delivers bridged satellite revenue. */
  excludeFrom?: string;
  /** Native-amount denomination; defaults to the null marker. */
  nativeAsset?: string;
  start: string;
};

// Per-chain fee sink, from the protocol's address registry (https://dexlaunch.fun/docs,
// "Deployed contracts"). All are UUPS proxies — stable addresses, only impls rotate.
// One per-chain object, passed straight through as `adapter` (repo convention — the module
// builder keeps only the whitelisted keys like `start`; fetch reads the rest at call time).
const chainConfig: Record<string, ChainCfg> = {
  [CHAIN.ROBINHOOD]: {
    // https://robinhoodchain.blockscout.com/address/0x949a6e0530119d7cDBE5e904e47056b39BE1f156
    collector: "0x949a6e0530119d7cDBE5e904e47056b39BE1f156",
    registry: "0xFDE53eC208e6f36cC15c2A3E9991d8E145757Cef",
    // The UsdgConverter delivers satellite revenue bridged home via Across; those FeesReceived
    // logs are the SAME fees already counted on the satellite at collection time.
    excludeFrom: "0xA1b8FfbbE071A8B77a6624C8C25F9F7090bbf0b4",
    hasDistributions: true,
    start: "2026-08-01", // genesis deploy on Robinhood Chain (2026-08-01T16:24:06Z)
  },
  [CHAIN.HYPERLIQUID]: {
    // BridgingFeeCollector — SaleFactory(0x7d80788C...a545).masterFeeCollector()
    collector: "0x53E5d2535547598CaB583f71f0B1a18dB1828859",
    registry: "0xefec724b358d632E5c16Abd15d165dC1eED69391",
    hasDistributions: false,
    start: "2026-08-25", // satellite genesis on HyperEVM
  },
  [CHAIN.BOT_CHAIN]: {
    // UsdtBridgingFeeCollector — SaleFactory(0x7d80788C...a545).masterFeeCollector()
    collector: "0xD29b582Be05f181eadaC69f2DD1430f0A61D5134",
    registry: "0xefec724b358d632E5c16Abd15d165dC1eED69391",
    // Same asset as native BOT; only the wrapped side resolves in the price lookup here.
    nativeAsset: ADDRESSES.bot.WBOT,
    hasDistributions: false,
    start: "2026-08-26", // satellite genesis on BOT Chain (2026-08-26T23:13:09Z)
  },
};

// One label per stream. FeesReceived carries no per-source discriminator worth decoding (the
// sender set is open-ended: sales, pads, tokens, locker), so collected fees are one bucket.
const PLATFORM_FEES = "Platform Fees";
const REFERRAL_FEES = "Fees Paid Out To Referrers";
const PLATFORM_REVENUE = "Platform Fees Retained By The Protocol";
const FEES_TO_HOLDERS = "Fees To Governance Holders";
const FEES_TO_TREASURY = "Fees To Treasury";

const fetch = async (options: FetchOptions) => {
  const { collector, registry, excludeFrom, hasDistributions } = chainConfig[options.chain];
  const native = chainConfig[options.chain].nativeAsset ?? ADDRESSES.null;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const [received, referred, distributed] = await Promise.all([
    options.getLogs({ target: collector, eventAbi: FEES_RECEIVED }),
    options.getLogs({ target: registry, eventAbi: REFERRAL_PAID }),
    hasDistributions
      ? options.getLogs({ target: collector, eventAbi: FEES_DISTRIBUTED })
      : Promise.resolve([]),
  ]);

  for (const log of received) {
    // Skip satellite revenue re-arriving through the bridge — counted at origin already.
    if (excludeFrom && String(log.from).toLowerCase() === excludeFrom.toLowerCase()) continue;
    dailyFees.add(native, log.amount, PLATFORM_FEES);
    // Same amounts, its own balance + label: Revenue is the destination-side view (everything is
    // retained — split later between governance holders and the treasury), Fees the source side.
    dailyRevenue.add(native, log.amount, PLATFORM_REVENUE);
  }

  // The referrer's cut never reaches the collector, so it is missing from `received`. The user
  // paid it and the referrer keeps it: it is a fee, and the cost of funds against it, so it
  // lands in Fees and SupplySideRevenue and never in Revenue. `asset` is the zero address for
  // native fees and otherwise the ERC20 the fee arrived in.
  for (const log of referred) {
    const raw = String(log.asset).toLowerCase();
    const asset = raw === ADDRESSES.null ? native : raw;
    dailyFees.add(asset, log.cut, REFERRAL_FEES);
    dailySupplySideRevenue.add(asset, log.cut, REFERRAL_FEES);
  }

  for (const log of distributed) {
    dailyHoldersRevenue.add(native, log.holdersAmount, FEES_TO_HOLDERS);
    dailyProtocolRevenue.add(native, log.ownerAmount, FEES_TO_TREASURY);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Everything users paid the protocol: all native revenue arriving at the chain's fee collector — the PlatformFeeCollector on Robinhood Chain, a bridging collector on each satellite — from the 2% presale service fee, launch tokens' master fee, the bonding pad's 0.5% per-trade skim, the instant-launch fee and the locker's fee-claim cut (FeesReceived logs), PLUS the 10% referrer share carved off the user-attributed streams before they reach the collector (ReferralPaid logs). Satellite revenue is counted on the chain that earned it and excluded from Robinhood when it arrives bridged, so it counts once.",
  Revenue: "The share of fees the protocol keeps: collector receipts only, so the referrer share is excluded. The protocol retains all of it, with the home-chain split between governance holders and the treasury reported under HoldersRevenue / ProtocolRevenue.",
  SupplySideRevenue: "The 10% referrer share, the one part of a fee the protocol does not keep — paid out by the ReferralRegistry to the trader's referrer before the remainder reaches the collector (ReferralPaid logs).",
  HoldersRevenue: "The share of every home-chain distribution delivered to GovernanceToken holders as native-ETH dividends (FeesDistributed logs; distributions happen only on Robinhood Chain).",
  ProtocolRevenue: "The share of every home-chain distribution delivered to the protocol owner (FeesDistributed logs; distributions happen only on Robinhood Chain).",
};

const breakdownMethodology = {
  Fees: {
    [PLATFORM_FEES]:
      "Revenue received by the chain's fee collector (PlatformFeeCollector on Robinhood Chain; a bridging collector on each satellite) from every protocol stream: the 2% presale service fee, launch tokens' master fee, the bonding pad's 0.5% per-trade skim, the instant-launch fee, and the locker's fee-claim cut. From FeesReceived logs. Bridge re-deliveries are excluded on Robinhood so satellite revenue counts once, at origin.",
    [REFERRAL_FEES]:
      "The 10% referrer share carved off the user-attributed streams (pad trade skim, presale service fee, instant-launch fee) by the ReferralRegistry before the remainder reaches the collector — paid by the user, kept by the referrer, so it counts as fees but not as protocol revenue (ReferralPaid logs).",
  },
  Revenue: {
    [PLATFORM_REVENUE]:
      "Every fee that reaches the collector is retained by the protocol and later split between governance holders and the treasury on the home chain — see HoldersRevenue / ProtocolRevenue for the split.",
  },
  SupplySideRevenue: {
    [REFERRAL_FEES]:
      "The referrer's 10% cut, paid out before the remainder reaches the collector (ReferralPaid logs).",
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

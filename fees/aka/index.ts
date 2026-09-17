import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// aka.fun - "RWA-Powered Launchpad on Arc" (aka.fun/how-it-works). Docs describe a 2%
// per-side trading fee split five ways (Creator 30% / RWA Treasury 30% / Platform 20% /
// Referral 15% / Community Drop 5%) but explicitly flag every one of those numbers as
// "the placeholder set from the product mockups... pending finalization." Rather than
// trust that prose, the split below was reverse-engineered from >1800 real fee
// distributions on AkaFunHook (contract unverified, so matched by raw topic0 and
// decoded manually - an eventAbi string needs the real event name to derive a topic
// filter, which isn't recoverable from the hash alone).
//
// AkaFunHook emits one FeeDistributed-shaped log per payout leg per trade:
// topics = [sig, category (uint), currency (address, always the zero/native address -
// every payout is a native transfer, and Arc's native gas token IS USDC, 18dec, not
// the 6dec ERC-20 facade at ADDRESSES.arc.USDC), recipient (address)], data = amount.
// Grouping 1800+ trades by category and recipient:
//   - category 0 always pays ONE fixed address (0x0ef65b...5f040e) -> the platform.
//   - category 1 always pays the launched token's OWN per-token vault contract (a
//     distinct address per token, deployed per-launch) -> matches the docs' combined
//     Creator (streamed) + RWA Treasury (buys the token's basket) flows; both are
//     payments away from the platform to a per-token destination, and the single
//     on-chain payment cannot be split into the two legs, so they're one bucket here.
//   - category 4 always pays a SECOND per-token vault contract, which itself emits a
//     log matching the docs' "fills pool for 30-min draws" Community Drop mechanic.
//   - category 2 fires rarely (19 total AkaFunReferral-contract events on the whole
//     chain to date; <0.002% of cumulative fee volume) and pays a per-trade referrer.
//   - category 3 has never fired on-chain.
// The split is EXACTLY the docs' bps whenever a referral is present: category
// 1/2/4/0 = 60/15/5/20 (Creator 30 + RWA Treasury 30 = 60, Referral 15, Community 5,
// Platform 20). Without a referral (the large majority of trades) the forfeited 15%
// referral cut goes entirely to the platform, so category 0 becomes 35% instead of 20%.
// Every trade checked (1800+) matches one of these two exact splits, to the wei modulo
// rounding - so this is a real, stable, currently-live parameter set, just a different
// one than the docs' prose, exactly as the docs' own "placeholder" warning predicts.
const AKA_FUN_HOOK = "0x61d3117023D827f4851e88a7CAD5C7bD49e4C4Cc";
const FEE_DISTRIBUTED_TOPIC = "0x0cca350ac2dab59d81ee3f18f57aaabd263c5d17aeca2a22e7a828cd906d20f6";

const PLATFORM_FEES = "Platform Fees";
const CREATOR_RWA_TREASURY_FEES = "Creator and RWA Treasury Fees";
const REFERRAL_FEES = "Referral Fees";
const COMMUNITY_DROP_FEES = "Community Drop Fees";

const CATEGORY_PLATFORM = "0";
const CATEGORY_CREATOR_RWA_TREASURY = "1";
const CATEGORY_REFERRAL = "2";
const CATEGORY_COMMUNITY_DROP = "4";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: AKA_FUN_HOOK,
    topic: FEE_DISTRIBUTED_TOPIC,
    entireLog: true,
  });

  for (const log of logs) {
    const category = BigInt(log.topics[1]).toString();
    const amount = BigInt(log.data);
    if (amount === 0n) continue;

    switch (category) {
      case CATEGORY_PLATFORM:
        dailyFees.addGasToken(amount, PLATFORM_FEES);
        dailyRevenue.addGasToken(amount, PLATFORM_FEES);
        break;
      case CATEGORY_CREATOR_RWA_TREASURY:
        dailyFees.addGasToken(amount, CREATOR_RWA_TREASURY_FEES);
        dailySupplySideRevenue.addGasToken(amount, CREATOR_RWA_TREASURY_FEES);
        break;
      case CATEGORY_REFERRAL:
        dailyFees.addGasToken(amount, REFERRAL_FEES);
        dailySupplySideRevenue.addGasToken(amount, REFERRAL_FEES);
        break;
      case CATEGORY_COMMUNITY_DROP:
        dailyFees.addGasToken(amount, COMMUNITY_DROP_FEES);
        dailySupplySideRevenue.addGasToken(amount, COMMUNITY_DROP_FEES);
        break;
      // category 3 has never fired on-chain (see note above); left unhandled rather
      // than guessed at, so it is silently excluded until it is actually observed.
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Every leg of AkaFunHook's per-trade fee distribution: the platform's cut, the launched token's combined Creator+RWA-Treasury vault payment, the referral payout (when a referrer is present), and the Community Drop pool payment. Always denominated in USDC (Arc's native gas token), read directly from each distribution's own amount field.",
  Revenue: "The platform's fixed-address share: 20% of the fee when a referral is used, or 35% when it is not (the forfeited referral cut is paid to the platform instead of being redistributed elsewhere).",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "The Creator+RWA-Treasury combined per-token vault payment (60% of the fee), plus the Community Drop per-token pool payment (5%), plus the referral payout when present (15%).",
};

const breakdownMethodology = {
  Fees: {
    [PLATFORM_FEES]: "Platform's share of the trading fee, paid to a single fixed address.",
    [CREATOR_RWA_TREASURY_FEES]: "Combined Creator (streamed continuously) and RWA Treasury (buys the token's real-world-asset basket) share, paid in one payment to the launched token's own per-token vault contract; not separable on-chain into the two legs.",
    [REFERRAL_FEES]: "Referral payout, paid only on trades that carry a referrer.",
    [COMMUNITY_DROP_FEES]: "Community Drop share, paid to a per-token pool that funds the docs' periodic community draws.",
  },
  Revenue: {
    [PLATFORM_FEES]: "Platform's share of the trading fee.",
  },
  ProtocolRevenue: {
    [PLATFORM_FEES]: "Platform's share of the trading fee.",
  },
  SupplySideRevenue: {
    [CREATOR_RWA_TREASURY_FEES]: "Combined Creator and RWA Treasury share, paid to the launched token's own vault.",
    [REFERRAL_FEES]: "Referral payout on trades that carry a referrer.",
    [COMMUNITY_DROP_FEES]: "Community Drop share, paid to the launched token's community pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology,
  breakdownMethodology,
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// aka.fun - "RWA-Powered Launchpad on Arc". Docs list a 2%-per-side fee split as
// "placeholder... pending finalization", so the real split below is read from
// AkaFunHook's fee-distribution events instead (contract unverified, matched by raw
// topic since the true event name isn't recoverable from the hash). Category 0 pays
// a fixed platform address; category 1 pays each launch's own vault (its docs'
// combined Creator+RWA-Treasury share, not separable on-chain); category 4 pays a
// second per-launch vault (Community Drop); category 2 is a rare referral payout;
// category 3 has never fired. With a referral, the live split matches the docs
// exactly (60/15/5/20); without one (most trades), the forfeited 15% goes to the
// platform instead (35% there).
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
      // category 3 has never fired on-chain; left unhandled rather than guessed at.
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
  Fees: "Every leg of aka.fun's per-trade fee distribution: platform, creator/RWA-treasury, referral, and community drop, in USDC.",
  Revenue: "The platform's share: 20% of the fee with a referral, or 35% without one (the forfeited referral cut goes to the platform).",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "The creator/RWA-treasury share, the community drop share, and the referral payout when present.",
};

const breakdownMethodology = {
  Fees: {
    [PLATFORM_FEES]: "Platform's share of the trading fee.",
    [CREATOR_RWA_TREASURY_FEES]: "Creator and RWA-treasury share, paid to the launched token's own vault; not separable on-chain.",
    [REFERRAL_FEES]: "Referral payout, paid only on trades with a referrer.",
    [COMMUNITY_DROP_FEES]: "Community drop share, paid to the launched token's community pool.",
  },
  Revenue: {
    [PLATFORM_FEES]: "Platform's share of the trading fee.",
  },
  ProtocolRevenue: {
    [PLATFORM_FEES]: "Platform's share of the trading fee.",
  },
  SupplySideRevenue: {
    [CREATOR_RWA_TREASURY_FEES]: "Creator and RWA-treasury share, paid to the launched token's own vault.",
    [REFERRAL_FEES]: "Referral payout on trades with a referrer.",
    [COMMUNITY_DROP_FEES]: "Community drop share, paid to the launched token's community pool.",
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

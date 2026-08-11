import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Vultisig charges an affiliate fee on the native swaps it routes through THORChain. The fee is
// tagged with a per-platform affiliate THORName, so Midgard reports the earnings directly:
//   v0  SDK, desktop app and browser extension
//       github.com/vultisig/vultisig-sdk packages/core/chain/swap/native/nativeSwapAffiliateConfig.ts
//   vi  iOS / macOS
//       github.com/vultisig/vultisig-ios VultisigApp/Blockchain/THORChain/Signing/THORChainSwaps.swift
//   va  Android
//       github.com/vultisig/vultisig-android data/src/main/kotlin/.../chains/helpers/THORChainSwaps.kt
const AFFILIATE_NAMES = ["v0", "vi", "va"];

// ninerealms Midgard is offline; this is the gateway the thorchain-dex adapter already uses
const THORCHAIN_MIDGARD = "https://gateway.liquify.com/chain/thorchain_midgard/v2";
const HEADERS = { headers: { "x-client-id": "defillama" } };

const DAY = 24 * 60 * 60;
const AFFILIATE_FEES = "Swap Affiliate Fees";

// version 1 because Midgard's affiliate earnings route only serves daily aggregates: it accepts a
// from..to window but answers any sub-day window with the whole day's total, so an hourly adapter
// would count the same earnings up to 24 times. The day bucket is requested explicitly instead.
const earningsUSD = async (name: string, startOfDay: number, endOfDay: number) => {
  const url = `${THORCHAIN_MIDGARD}/history/affiliate/earnings?thorname=${name}&interval=day&count=1&to=${endOfDay}`;
  const bucket = (await httpGet(url, HEADERS))?.[0];
  if (!bucket) return 0;
  if (Number(bucket.startTime) !== startOfDay)
    throw new Error(`vultisig: Midgard returned bucket ${bucket.startTime}, expected ${startOfDay}`);
  // totalEarningsUSD is Int64(e2) USD
  return Number(bucket.totalEarningsUSD ?? 0) / 100;
};

const fetch = async (options: FetchOptions) => {
  const endOfDay = options.startOfDay + DAY;
  const earnings = await Promise.all(
    AFFILIATE_NAMES.map((name) => earningsUSD(name, options.startOfDay, endOfDay)),
  );

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(earnings.reduce((sum, v) => sum + v, 0), AFFILIATE_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Affiliate fees earned on swaps the Vultisig wallet routes through THORChain, read from Midgard's affiliate earnings history (/history/affiliate/earnings, totalEarningsUSD) for the Vultisig affiliate names v0 (SDK, desktop app, browser extension), vi (iOS/macOS) and va (Android).",
  UserFees: "Same as Fees - the affiliate fee is taken out of the swap and paid by the user.",
  Revenue: "All affiliate fees accrue to Vultisig. When a swap carries a referral code THORChain pays the referrer under the referrer's own THORName, so the referrer's cut never lands on the Vultisig names and there is no supply-side cut left to deduct.",
  ProtocolRevenue: "All revenue is protocol revenue; it is settled to the Vultisig fee wallet.",
};

const breakdownMethodology = {
  Fees: {
    [AFFILIATE_FEES]: "Affiliate fee charged on THORChain swaps routed by Vultisig.",
  },
  UserFees: {
    [AFFILIATE_FEES]: "Affiliate fee charged on THORChain swaps routed by Vultisig, paid by the swapping user.",
  },
  Revenue: {
    [AFFILIATE_FEES]: "Affiliate fee charged on THORChain swaps routed by Vultisig, all of it kept by the protocol.",
  },
  ProtocolRevenue: {
    [AFFILIATE_FEES]: "Affiliate fee charged on THORChain swaps routed by Vultisig, settled to the Vultisig fee wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.THORCHAIN],
  // Midgard's affiliate earnings series starts here network-wide - no affiliate name reports
  // earnings before this date, so earlier days would publish a false zero.
  // MayaChain is left out: its Midgard exposes affiliate volume but no affiliate earnings route.
  start: "2024-12-13",
  methodology,
  breakdownMethodology,
};

export default adapter;

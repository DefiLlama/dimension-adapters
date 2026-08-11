import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Vultisig charges an affiliate fee on the native swaps it routes through THORChain. The fee is
// tagged with a per-platform affiliate THORName, so Midgard reports the collections directly:
//   v0  SDK, desktop app and browser extension (50 bps)
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
const FEES_TO_VULTISIG = "THORChain Affiliate Fees to Vultisig Fee Wallet";

// Route semantics, verified against live data because the field names mislead:
//   /history/affiliate            -> affiliate fee COLLECTIONS per THORName. The field is called
//                                    volumeUSD but it is the fee amount: for a day where v0 (fixed
//                                    50 bps) collected on $432.50 of swaps it reports $2.17 - 50.2 bps.
//   /history/affiliate/earnings   -> sums each matching action's LIQUIDITY fee (pool fee, not the
//                                    affiliate's) - its earningsRUNE exactly equals the actions'
//                                    metadata.swap.liquidityFee. Not Vultisig revenue; unused here.
//   actions metadata affiliateFee -> the fee in BASIS POINTS, not an amount.
// version 1 because this route only serves daily aggregates: any sub-day window answers with the
// whole day's total, so an hourly adapter would count the same fees up to 24 times.
const collectedFeesUSD = async (name: string, startOfDay: number, endOfDay: number) => {
  const url = `${THORCHAIN_MIDGARD}/history/affiliate?thorname=${name}&interval=day&count=1&to=${endOfDay}`;
  const bucket = (await httpGet(url, HEADERS))?.intervals?.[0];
  if (!bucket) return 0;
  if (Number(bucket.startTime) !== startOfDay)
    throw new Error(`vultisig: Midgard returned bucket ${bucket.startTime}, expected ${startOfDay}`);
  // volumeUSD on this route is the collected affiliate fee, Int64(e2) USD
  return Number(bucket.volumeUSD ?? 0) / 100;
};

const fetch = async (options: FetchOptions) => {
  const endOfDay = options.startOfDay + DAY;
  const collected = await Promise.all(
    AFFILIATE_NAMES.map((name) => collectedFeesUSD(name, options.startOfDay, endOfDay)),
  );
  const total = collected.reduce((sum, v) => sum + v, 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(total, AFFILIATE_FEES);
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(total, FEES_TO_VULTISIG);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Affiliate fees collected on swaps the Vultisig wallet routes through THORChain, read from Midgard's per-THORName affiliate history for the Vultisig affiliate names v0 (SDK, desktop app, browser extension), vi (iOS/macOS) and va (Android).",
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
    [FEES_TO_VULTISIG]: "Affiliate fees collected under the Vultisig THORNames, settled to the Vultisig fee wallet.",
  },
  ProtocolRevenue: {
    [FEES_TO_VULTISIG]: "Affiliate fees collected under the Vultisig THORNames, settled to the Vultisig fee wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.THORCHAIN],
  // Midgard's affiliate series starts here network-wide - no affiliate name reports
  // collections before this date, so earlier days would publish a false zero.
  // MayaChain is left out: its Midgard reports affiliate swap volume but not fee collections.
  start: "2024-12-13",
  methodology,
  breakdownMethodology,
};

export default adapter;

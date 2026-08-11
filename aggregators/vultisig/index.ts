import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Vultisig is a self-custodial MPC wallet whose native cross-chain swaps are routed through
// THORChain and MayaChain. Every swap it builds carries a per-platform affiliate
// THORName / MAYAName, so Midgard attributes the routed volume back to Vultisig:
//   v0  SDK, desktop app and browser extension
//       github.com/vultisig/vultisig-sdk packages/core/chain/swap/native/nativeSwapAffiliateConfig.ts
//   vi  iOS / macOS
//       github.com/vultisig/vultisig-ios VultisigApp/Blockchain/THORChain/Signing/THORChainSwaps.swift
//   va  Android
//       github.com/vultisig/vultisig-android data/src/main/kotlin/.../chains/helpers/THORChainSwaps.kt
// The same three names are used on MayaChain: iOS/Android reuse their THORChain affiliate in
// MayaChainService/MayaChainApi and the SDK reuses nativeSwapAffiliateConfig for every native swap chain.
const AFFILIATE_NAMES = ["v0", "vi", "va"];

// ninerealms Midgard is offline; this is the gateway the thorchain-dex adapter already uses
const THORCHAIN_MIDGARD = "https://gateway.liquify.com/chain/thorchain_midgard/v2";
const MAYACHAIN_MIDGARD = "https://midgard.mayachain.info/v2";
const THORCHAIN_HEADERS = { headers: { "x-client-id": "defillama" } };

const DAY = 24 * 60 * 60;

type DayBucket = { startTime: string };

// version 1 because MayaChain's Midgard only serves daily aggregates on this route: it accepts a
// from..to window but answers any sub-day window with the whole day's total, so an hourly adapter
// would count the same swaps up to 24 times. Both chains are therefore queried as day buckets.
const assertRequestedDay = (bucket: DayBucket | undefined, startOfDay: number, chain: string) => {
  if (!bucket) return false;
  if (Number(bucket.startTime) !== startOfDay)
    throw new Error(`vultisig: ${chain} Midgard returned bucket ${bucket.startTime}, expected ${startOfDay}`);
  return true;
};

type ChainConfig = {
  start: string;
  // affiliate swap volume in USD for the UTC day ending at `endOfDay`
  volumeUSD: (name: string, startOfDay: number, endOfDay: number) => Promise<number>;
};

const chainConfig: Record<string, ChainConfig> = {
  // start = first day Midgard reports non-zero volume for any Vultisig affiliate name
  // (thorname v0 2024-04-12, vi 2024-05-20, va 2024-08-15)
  [CHAIN.THORCHAIN]: {
    start: "2024-04-12",
    volumeUSD: async (name, startOfDay, endOfDay) => {
      const url = `${THORCHAIN_MIDGARD}/history/affiliate/stats?thorname=${name}&interval=day&count=1&to=${endOfDay}`;
      const buckets = await httpGet(url, THORCHAIN_HEADERS);
      const bucket = buckets?.[0];
      if (!assertRequestedDay(bucket, startOfDay, CHAIN.THORCHAIN)) return 0;
      // totalVolumeUSD is Int64(e2) USD
      return Number(bucket.totalVolumeUSD ?? 0) / 100;
    },
  },
  // mayaname vi/va 2025-03-14, v0 2025-03-17
  [CHAIN.MAYA]: {
    start: "2025-03-14",
    volumeUSD: async (name, startOfDay, endOfDay) => {
      // MayaChain's Midgard has no /history/affiliate/stats route. Its /history/affiliate route
      // reports affiliate swap VOLUME, unlike THORChain's same-named route which reports
      // affiliate earnings (that one feeds the fees adapter).
      const url = `${MAYACHAIN_MIDGARD}/history/affiliate?mayaname=${name}&interval=day&count=1&to=${endOfDay}`;
      const bucket = (await httpGet(url))?.intervals?.[0];
      if (!assertRequestedDay(bucket, startOfDay, CHAIN.MAYA)) return 0;
      // volumeUSD is Int64(e2) USD
      return Number(bucket.volumeUSD ?? 0) / 100;
    },
  },
};

const fetch = async (options: FetchOptions) => {
  const { volumeUSD } = chainConfig[options.chain];
  const endOfDay = options.startOfDay + DAY;

  let dailyVolume = 0;
  for (const name of AFFILIATE_NAMES) {
    dailyVolume += await volumeUSD(name, options.startOfDay, endOfDay);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume:
      "Swap volume routed by the Vultisig wallet through THORChain and MayaChain, read from each chain's Midgard affiliate history for the Vultisig affiliate names v0 (SDK, desktop app, browser extension), vi (iOS/macOS) and va (Android), and attributed to the chain that settled the swap. Swaps routed through third-party aggregators (LI.FI, KyberSwap, 1inch) are not included.",
  },
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Daily aggregates indexed by XOXNO from the swap-aggregator router's events.
// Router (Stellar mainnet): CCVENFSVCBYDHVOACFZXMNNYVOZ3LKXPZYU5LUI4N7KTXOKRVYD7F3TR
// Event topics ["router", "swap"]; data map { sender, token_in, token_out,
// amount_in, amount_out, referral_id, fee_token, static_fee, referral_fee },
// published once per successful swap. static_fee goes to the protocol and
// referral_fee to the referral partner, both in fee_token.
const API_BASE = "https://api.xoxno.com";
const VOLUME_EXPORT_PATH = "/integrations/swap/stellar/volume";
const HEADERS = { "User-Agent": "dune-analytics" };
const REQUEST_TIMEOUT_MS = 10_000;

const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";
const SWAP_FEES_TO_REFERRERS = "Swap Fees To Referrers";

type VolumePoint = {
  timestamp?: string;
  dailyVolumeUsd?: number;
  dailyProtocolFeeUsd?: number;
  dailyReferralFeeUsd?: number;
};

type VolumeExport = { points?: VolumePoint[] };

function dayRange(timestamp: number) {
  const day = new Date(timestamp * 1000);
  day.setUTCHours(0, 0, 0, 0);
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    startTime: day.toISOString().slice(0, 10),
    endTime: next.toISOString().slice(0, 10),
  };
}

function usd(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`XOXNO aggregator export returned an invalid USD value: ${value}`);
  }
  return n;
}

const fetch_ = async (options: FetchOptions) => {
  // [startTime, endTime) is exactly one UTC day.
  const { startTime, endTime } = dayRange(options.startTimestamp);
  const url = `${API_BASE}${VOLUME_EXPORT_PATH}?startTime=${startTime}&endTime=${endTime}`;

  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`XOXNO aggregator volume export failed: ${response.status}`);
  }

  const data = (await response.json()) as VolumeExport;
  // The export zero-fills every day in the window, so a missing point means
  // the day was not served: fail rather than record a false zero.
  const point = (data.points ?? []).find(
    (p) => typeof p.timestamp === "string" && p.timestamp.slice(0, 10) === startTime,
  );
  if (!point) {
    throw new Error(`XOXNO aggregator volume export has no data for ${startTime}`);
  }

  const protocolFees = usd(point.dailyProtocolFeeUsd);
  const referralFees = usd(point.dailyReferralFeeUsd);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.addUSDValue(usd(point.dailyVolumeUsd));
  dailyFees.addUSDValue(protocolFees + referralFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(protocolFees, SWAP_FEES_TO_PROTOCOL);
  dailySupplySideRevenue.addUSDValue(referralFees, SWAP_FEES_TO_REFERRERS);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Input amount of every swap routed through the XOXNO swap-aggregator router on Stellar, valued in USD at swap time. Includes swaps from wallets, integrator contracts and XOXNO lending strategies, each counted once on its input leg.",
  Fees: "The aggregator's own fee on each swap: the protocol (static) fee plus the referral partner fee, charged only on swaps with an active referral. Fees of the underlying DEX pools are not included.",
  Revenue: "The protocol (static) fee kept by XOXNO.",
  ProtocolRevenue: "The protocol (static) fee kept by XOXNO.",
  SupplySideRevenue: "The referral fee paid to the referral partner of each swap.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "Protocol fee plus referral fee charged by the XOXNO router on each referred swap.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol (static) fee kept by XOXNO.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol (static) fee kept by XOXNO.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_REFERRERS]: "The referral fee paid to the referral partner of each swap.",
  },
};

const adapter: SimpleAdapter = {
  // External API returning daily aggregates only; v2 block-range fetching is
  // not possible against it.
  version: 1,
  fetch: fetch_,
  chains: [CHAIN.STELLAR],
  start: "2026-11-19",
  methodology,
  breakdownMethodology,
};

export default adapter;
